import { BOT_AI } from '../config/BotConfig';
import { ONBOARDING } from '../config/EventConfig';
import { SIGNAL } from '../config/SignalConfig';
import { NoiseKind, SignalAbility } from '../utils/Constants';
import { PERF } from '../config/GameConfig';
import { ArmorLevel, BotState, LootType, WeaponType } from '../utils/Constants';
import type { Vec2 } from '../utils/Constants';
import { angleBetween, angleDelta, clamp, distance, degToRad } from '../utils/MathUtils';
import type { Bot } from '../entities/Bot';
import type { Combatant } from '../entities/Combatant';
import { SLOT_MELEE, SLOT_PRIMARY, SLOT_SECONDARY } from '../entities/Inventory';
import type { SlotIndex } from '../entities/Inventory';
import type { MatchContext } from './MatchContext';

/**
 * State-driven bot brains.
 *
 * Decisions run at BOT_THINK_HZ; steering, aiming and trigger control run every frame.
 * Perception is deliberately imperfect: bots have a field of view, a notice roll, a
 * reaction delay, aim error that grows with range, and a memory that decays.
 */
export class BotAISystem {
  private ctx!: MatchContext;
  private pathBudget = 0;

  bind(ctx: MatchContext): void {
    this.ctx = ctx;
  }

  update(delta: number, bots: readonly Bot[]): void {
    this.pathBudget = PERF.pathSolvesPerFrame;
    const now = this.ctx.now;
    for (const bot of bots) {
      if (!bot.alive) continue;
      if (now >= bot.nextThinkAt) {
        bot.nextThinkAt = now + (1000 / PERF.botThinkHz) * this.ctx.rng.range(0.8, 1.25);
        this.think(bot);
      }
      this.act(bot, delta);
    }
  }

  // ------------------------------------------------------------------ perception

  private perceive(bot: Bot): void {
    const now = this.ctx.now;
    const profile = bot.profile;
    // Fog cuts everyone's sight; the onboarding grace period dulls the bots near a new
    // player so their first fight is survivable.
    const viewDistance = profile.viewDistance * this.ctx.director.visionMultiplier;
    const gentle = now < bot.gentleUntil;

    // Being shot at is an instant, reliable cue.
    if (bot.lastDamageFrom && bot.lastDamageFrom.alive && now - bot.lastDamagedAt < 2200) {
      if (bot.target !== bot.lastDamageFrom) {
        bot.target = bot.lastDamageFrom;
        bot.reactionReadyAt = now + profile.reactionMs[0] * 0.6;
      }
      bot.targetLastSeenAt = now;
      bot.targetLastKnownPos.x = bot.lastDamageFrom.x;
      bot.targetLastKnownPos.y = bot.lastDamageFrom.y;
    }

    let best: Combatant | null = null;
    let bestScore = -Infinity;

    for (const other of this.ctx.combatants) {
      if (other === bot || !other.alive) continue;
      const dist = distance(bot.x, bot.y, other.x, other.y);
      if (dist > viewDistance) continue;

      const angle = angleBetween(bot.x, bot.y, other.x, other.y);
      const offAxis = Math.abs(angleDelta(bot.rotation, angle));
      const inFov = offAxis < degToRad(profile.fovDeg / 2);
      // Targets behind the bot are only noticed when close.
      if (!inFov && dist > viewDistance * 0.35) continue;

      if (!this.ctx.collision.hasLineOfSight(bot.x, bot.y, other.x, other.y)) continue;

      let chance = profile.noticeChance;
      chance *= 1 - clamp(dist / viewDistance, 0, 1) * 0.45;
      chance *= 1 - this.ctx.collision.concealmentAt(other.x, other.y) * 0.7;
      if (!inFov) chance *= 0.5;
      if (!other.isMoving) chance *= 0.75;
      if (this.ctx.now - other.lastFireAt < 700) chance = Math.min(1, chance * 2.2);
      if (other === bot.target) chance = Math.min(1, chance * 2.5);
      if (gentle && other.isPlayer) chance *= ONBOARDING.gentleNoticeMult;

      if (this.ctx.rng.next() > chance) continue;

      // Prefer close, wounded, already-engaged targets.
      const score =
        -dist + (other === bot.target ? 260 : 0) + (1 - other.health / other.maxHealth) * 160;
      if (score > bestScore) {
        bestScore = score;
        best = other;
      }
    }

    if (best) {
      if (bot.target !== best && now >= bot.nextRetargetAt) {
        bot.target = best;
        bot.nextRetargetAt = now + BOT_AI.retargetMs;
        const reactionMult = gentle && best.isPlayer ? ONBOARDING.gentleReactionMult : 1;
        bot.reactionReadyAt =
          now + this.ctx.rng.range(profile.reactionMs[0], profile.reactionMs[1]) * reactionMult;
      }
      if (bot.target === best) {
        bot.targetLastSeenAt = now;
        bot.targetLastKnownPos.x = best.x;
        bot.targetLastKnownPos.y = best.y;
      }
    }

    const memoryWindow = BOT_AI.memoryMs * bot.profile.persistence;
    if (bot.target && (!bot.target.alive || now - bot.targetLastSeenAt > memoryWindow)) {
      if (bot.target.alive) {
        bot.investigatePoint = { x: bot.targetLastKnownPos.x, y: bot.targetLastKnownPos.y };
      }
      bot.target = null;
    }
  }

  /**
   * A noise was heard. `strength` is 0..1 by distance within the sound's radius.
   * Bots never learn the exact source - they get a fuzzy point to look at.
   */
  hearNoise(bot: Bot, x: number, y: number, strength: number, kind: NoiseKind): void {
    if (bot.target) return;
    if (strength < 0.2) return;
    const attention =
      kind === NoiseKind.Gunshot ? 1 : kind === NoiseKind.Door ? 0.85 : kind === NoiseKind.Run ? 0.5 : 0.3;
    if (this.ctx.rng.next() > BOT_AI.investigateChance * attention * (0.5 + strength)) return;
    const spread = clamp((1 - strength) * 240, 26, 200);
    bot.investigatePoint = {
      x: x + this.ctx.rng.range(-spread, spread),
      y: y + this.ctx.rng.range(-spread, spread),
    };
  }

  /** A Signal broadcast puts a hard objective on the map for a while. */
  alertToSignal(bot: Bot, x: number, y: number): void {
    bot.objectivePoint = { x, y };
    bot.objectiveUntil = this.ctx.now + 12000;
    bot.clearPath();
  }

  // ------------------------------------------------------------------ decisions

  private think(bot: Bot): void {
    this.perceive(bot);
    this.manageWeapons(bot);
    this.opportunisticPickup(bot);
    this.maybeUseAbility(bot);

    const now = this.ctx.now;
    const healthRatio = bot.health / bot.maxHealth;
    const zone = this.ctx.zone;
    const targetVisible =
      bot.target !== null && bot.target.alive && now - bot.targetLastSeenAt < 350;

    // 1. The circle overrides almost everything.
    const outsideZone = !zone.isInside(bot.x, bot.y, 0);
    const zoneClosingSoon =
      zone.state === 'waiting' && zone.secondsRemaining < BOT_AI.zonePanicSeconds;
    const willBeOutside =
      zone.state === 'shrinking' || zoneClosingSoon
        ? distance(bot.x, bot.y, zone.nextCenter.x, zone.nextCenter.y) >
          zone.nextRadius - BOT_AI.zoneSafetyMargin
        : false;

    if (outsideZone || (willBeOutside && !targetVisible)) {
      this.enterMoveToZone(bot);
      return;
    }

    // 2. Survival.
    if (healthRatio < bot.profile.fleeThreshold && targetVisible) {
      this.enterFlee(bot);
      return;
    }
    if (
      healthRatio < bot.profile.healThreshold &&
      !targetVisible &&
      now - bot.lastDamagedAt > 2600 &&
      (bot.inventory.bandages > 0 || bot.inventory.medkits > 0)
    ) {
      this.enterHeal(bot);
      return;
    }

    // 3. Fight - but a bot holding only a knife looks for a gun before committing, and
    // during the opening phase everyone stays focused on looting.
    if (bot.target && bot.target.alive) {
      const targetDist = distance(bot.x, bot.y, bot.target.x, bot.target.y);
      const outgunned = !bot.inventory.hasGun && targetDist > BOT_AI.desperateChargeRange;
      const shotAtRecently = now - bot.lastDamagedAt < 3000;
      const openingHold =
        this.ctx.matchTimeMs < BOT_AI.openingPhaseMs &&
        targetDist > BOT_AI.openingEngageRange &&
        !shotAtRecently;
      if (!outgunned && !openingHold) {
        if (targetVisible) {
          this.enterAttack(bot);
          return;
        }
        if (now - bot.targetLastSeenAt < BOT_AI.memoryMs * bot.profile.persistence) {
          this.enterSearch(bot, bot.targetLastKnownPos);
          return;
        }
      } else if (targetVisible) {
        const lootFirst = this.pickLootTarget(bot);
        if (lootFirst) {
          bot.state = BotState.Loot;
          bot.stateNote = outgunned ? 'needs a weapon' : 'gearing up';
          bot.lootTarget = lootFirst;
          this.requestPath(bot, lootFirst);
        } else if (outgunned) {
          this.enterFlee(bot);
        } else {
          this.enterExplore(bot);
        }
        return;
      }
    }

    // 4. Objectives. The Signal is worth crossing the map for; a broadcast or a supply
    // drop is worth a detour.
    const core = this.ctx.signal.corePosition;
    if (core && !targetVisible) {
      const coreDist = distance(bot.x, bot.y, core.x, core.y);
      if (coreDist < SIGNAL.botHuntRadius) {
        bot.state = BotState.SearchEnemy;
        bot.stateNote = 'going for the signal';
        this.requestPath(bot, core);
        return;
      }
    }
    if (bot.objectivePoint && now < bot.objectiveUntil && !targetVisible) {
      if (distance(bot.x, bot.y, bot.objectivePoint.x, bot.objectivePoint.y) < 90) {
        bot.objectivePoint = null;
      } else {
        bot.state = BotState.SearchEnemy;
        bot.stateNote = 'chasing the signal';
        this.requestPath(bot, this.clampToZone(bot.objectivePoint));
        return;
      }
    }

    // 5. Investigate noise.
    if (bot.investigatePoint) {
      this.enterSearch(bot, bot.investigatePoint);
      return;
    }

    // 6. Gear up.
    const lootTarget = this.pickLootTarget(bot);
    if (lootTarget) {
      bot.state = BotState.Loot;
      bot.stateNote = 'looting';
      bot.lootTarget = lootTarget;
      this.requestPath(bot, { x: lootTarget.x, y: lootTarget.y });
      return;
    }

    // 7. Hold the current area, or wander to a new one.
    if (bot.state === BotState.Idle && now < bot.idleUntil) {
      bot.stateNote = 'holding position';
      return;
    }
    this.enterExplore(bot);
  }

  private enterMoveToZone(bot: Bot): void {
    bot.state = BotState.MoveToZone;
    bot.stateNote = 'rotating';
    const safe = this.ctx.zone.safeTarget(bot.x, bot.y, BOT_AI.zoneSafetyMargin);
    // Aim a little inside so the bot does not stop right on the edge.
    const zone = this.ctx.zone;
    const target = zone.state === 'shrinking' ? zone.nextCenter : zone.center;
    const pull = 0.25;
    const dest = {
      x: safe.x + (target.x - safe.x) * pull,
      y: safe.y + (target.y - safe.y) * pull,
    };
    this.requestPath(bot, dest);
  }

  private enterFlee(bot: Bot): void {
    bot.state = BotState.Flee;
    bot.stateNote = 'retreating';
    const threat = bot.target;
    if (!threat) return;

    // Cornered bots with only a knife charge instead of running.
    const dist = distance(bot.x, bot.y, threat.x, threat.y);
    if (!bot.inventory.hasGun && dist < BOT_AI.desperateChargeRange) {
      this.enterAttack(bot);
      return;
    }

    const cover = this.ctx.collision.findCoverPoint(
      bot.x,
      bot.y,
      threat.x,
      threat.y,
      BOT_AI.coverScanRadius,
    );
    if (cover) {
      bot.coverPoint = cover;
      this.requestPath(bot, cover);
      return;
    }
    const away = angleBetween(threat.x, threat.y, bot.x, bot.y);
    const dest = this.clampToZone({
      x: bot.x + Math.cos(away) * 520,
      y: bot.y + Math.sin(away) * 520,
    });
    this.requestPath(bot, dest);
  }

  private enterHeal(bot: Bot): void {
    bot.state = BotState.Heal;
    bot.stateNote = 'healing';
    bot.clearPath();
    if (!bot.healing) {
      const inv = bot.inventory;
      const wantMedkit = bot.health <= 45 && inv.medkits > 0;
      if (wantMedkit) bot.startHeal('medkit');
      else if (inv.bandages > 0 && bot.health < 75) bot.startHeal('bandage');
      else if (inv.medkits > 0) bot.startHeal('medkit');
    }
  }

  private enterAttack(bot: Bot): void {
    bot.state = BotState.Attack;
    bot.stateNote = 'engaging';
    const target = bot.target;
    if (!target) return;

    const weapon = bot.weapon;
    const dist = distance(bot.x, bot.y, target.x, target.y);
    const ideal = weapon.base.aiIdealRange;

    // Reloading or badly outgunned: break line of sight first.
    const wantsCover =
      (weapon.reloading || weapon.ammoInMag === 0) && this.ctx.rng.next() < bot.profile.coverAffinity;
    if (wantsCover) {
      const cover = this.ctx.collision.findCoverPoint(
        bot.x,
        bot.y,
        target.x,
        target.y,
        BOT_AI.coverScanRadius,
      );
      if (cover) {
        bot.state = BotState.TakeCover;
        bot.stateNote = 'reloading in cover';
        bot.coverPoint = cover;
        this.requestPath(bot, cover);
        return;
      }
    }

    if (dist > ideal * 1.25) {
      const angle = angleBetween(bot.x, bot.y, target.x, target.y);
      const step = Math.min(dist - ideal, 360);
      this.requestPath(bot, this.clampToZone({
        x: bot.x + Math.cos(angle) * step,
        y: bot.y + Math.sin(angle) * step,
      }));
    } else if (dist < ideal * 0.55 && weapon.type !== WeaponType.Melee) {
      const away = angleBetween(target.x, target.y, bot.x, bot.y);
      this.requestPath(bot, this.clampToZone({
        x: bot.x + Math.cos(away) * 180,
        y: bot.y + Math.sin(away) * 180,
      }));
    } else {
      // In the pocket: hold ground and strafe.
      bot.clearPath();
    }

    if (this.ctx.now > bot.nextStrafeFlipAt) {
      bot.nextStrafeFlipAt = this.ctx.now + this.ctx.rng.range(700, 1800);
      if (this.ctx.rng.bool(0.45)) bot.strafeDir *= -1;
    }
  }

  private enterSearch(bot: Bot, point: Vec2): void {
    bot.state = BotState.SearchEnemy;
    bot.stateNote = 'searching';
    if (distance(bot.x, bot.y, point.x, point.y) < 70) {
      bot.investigatePoint = null;
      this.enterExplore(bot);
      return;
    }
    this.requestPath(bot, this.clampToZone(point));
  }

  private enterExplore(bot: Bot): void {
    const now = this.ctx.now;
    if (bot.state !== BotState.Explore || !bot.destination || now > bot.exploreUntil) {
      // Arriving somewhere is a good moment to sit still and watch it for a while.
      // Constant roaming is what makes a lobby of fifteen bots wipe itself out early.
      if (bot.state !== BotState.Idle && this.ctx.rng.bool(BOT_AI.holdChance)) {
        bot.state = BotState.Idle;
        bot.stateNote = 'holding position';
        bot.idleUntil = now + this.ctx.rng.range(BOT_AI.holdMs[0], BOT_AI.holdMs[1]);
        bot.scanAngle = bot.rotation;
        bot.clearPath();
        return;
      }
      bot.state = BotState.Explore;
      bot.stateNote = 'roaming';
      bot.exploreUntil = now + BOT_AI.exploreCommitMs;
      bot.destination = this.pickExploreDestination(bot);
      this.requestPath(bot, bot.destination);
    } else if (bot.path.length === 0 && bot.destination) {
      this.requestPath(bot, bot.destination);
    }
  }

  /** Prefers points of interest inside the safe circle. */
  private pickExploreDestination(bot: Bot): Vec2 {
    const rng = this.ctx.rng;
    const zone = this.ctx.zone;
    for (let i = 0; i < 12; i++) {
      // Only a minority of trips target a named district; the rest spread out, which
      // keeps fifteen bots from funnelling into the same three buildings.
      const useArea = rng.bool(0.35) && this.ctx.map.areas.length > 0;
      let point: Vec2;
      if (useArea) {
        const area = rng.pick(this.ctx.map.areas);
        point = rng.pointInCircle(area.x, area.y, area.radius * 0.75);
      } else {
        point = rng.pointInCircle(zone.center.x, zone.center.y, Math.max(220, zone.radius * 0.8));
      }
      if (!this.ctx.map.navGrid.isWalkable(point.x, point.y)) continue;
      if (!zone.isInside(point.x, point.y, BOT_AI.zoneSafetyMargin * 0.5)) continue;
      if (distance(point.x, point.y, bot.x, bot.y) < 200) continue;
      return point;
    }
    return this.clampToZone(rng.pointInCircle(zone.center.x, zone.center.y, zone.radius * 0.6));
  }

  private clampToZone(point: Vec2): Vec2 {
    return this.ctx.zone.safeTarget(point.x, point.y, BOT_AI.zoneSafetyMargin);
  }

  // ------------------------------------------------------------------ loadout

  private pickLootTarget(bot: Bot): Vec2 | null {
    const inv = bot.inventory;
    const needsWeapon = !inv.hasGun;
    const radius = needsWeapon ? BOT_AI.lootScanRadius * 1.4 : BOT_AI.lootScanRadius;
    const items = this.ctx.loot.queryNearby(bot.x, bot.y, radius);
    if (items.length === 0) return null;

    let best: Vec2 | null = null;
    let bestScore = 0;
    for (const item of items) {
      let score = this.ctx.loot.scoreFor(bot, item);
      if (score <= 0) continue;
      if (needsWeapon && item.payload.kind === LootType.Weapon) score += 120;
      const d = distance(bot.x, bot.y, item.x, item.y);
      const total = score - d * 0.14;
      // Once kitted out, only a real upgrade is worth the walk.
      const threshold = this.isKittedOut(bot) ? 45 : 8;
      if (total > threshold && total > bestScore) {
        bestScore = total;
        best = { x: item.x, y: item.y };
      }
    }
    return best;
  }

  private isKittedOut(bot: Bot): boolean {
    const inv = bot.inventory;
    if (!inv.hasGun) return false;
    const weapon = inv.primary ?? inv.secondary;
    if (!weapon) return false;
    const reserve = inv.reserveFor(weapon);
    const enoughAmmo = reserve > weapon.magazineSize * BOT_AI.satisfiedAmmoRatio;
    return enoughAmmo && inv.armorLevel >= ArmorLevel.Two && inv.bandages + inv.medkits >= 2;
  }

  /** Swaps to the weapon that suits the current engagement and reloads when idle. */
  private manageWeapons(bot: Bot): void {
    const inv = bot.inventory;
    const target = bot.target;

    if (!inv.hasGun) {
      if (inv.activeSlot !== SLOT_MELEE) bot.selectSlot(SLOT_MELEE);
      return;
    }

    const dist = target ? distance(bot.x, bot.y, target.x, target.y) : 400;
    let bestSlot: SlotIndex | null = null;
    let bestScore = -Infinity;
    for (const slot of [SLOT_PRIMARY, SLOT_SECONDARY] as SlotIndex[]) {
      const weapon = inv.weaponAt(slot);
      if (!weapon) continue;
      const total = weapon.ammoInMag + inv.reserveFor(weapon);
      if (total <= 0) continue;
      const stats = weapon.base;
      // Score by how well the weapon matches the engagement distance.
      const rangeFit = 1 - Math.min(1, Math.abs(dist - stats.aiIdealRange) / 700);
      let score = stats.aiScore * 0.5 + rangeFit * 60;
      if (weapon.ammoInMag <= 0) score -= 45;
      if (dist > stats.range) score -= 70;
      if (score > bestScore) {
        bestScore = score;
        bestSlot = slot;
      }
    }

    if (bestSlot !== null && bestSlot !== inv.activeSlot) {
      bot.selectSlot(bestSlot);
    } else if (bestSlot === null && inv.activeSlot !== SLOT_MELEE) {
      bot.selectSlot(SLOT_MELEE);
    }

    const weapon = bot.weapon;
    if (weapon.usesAmmo && !weapon.reloading) {
      const magRatio = weapon.magazineSize > 0 ? weapon.ammoInMag / weapon.magazineSize : 1;
      const enemyClose = target && distance(bot.x, bot.y, target.x, target.y) < 260;
      if (weapon.ammoInMag === 0 || (magRatio < BOT_AI.reloadWhenBelow && !enemyClose)) {
        bot.tryReload();
      }
    }
  }

  // ------------------------------------------------------------------ pathing

  private requestPath(bot: Bot, goal: Vec2): void {
    bot.destination = goal;
    const sameGoal =
      bot.pathGoal && distance(bot.pathGoal.x, bot.pathGoal.y, goal.x, goal.y) < 60;
    if (sameGoal && bot.path.length > 0 && bot.pathIndex < bot.path.length) return;

    // Short hops with a clear line skip the solver entirely.
    const d = distance(bot.x, bot.y, goal.x, goal.y);
    if (d < 340 && this.ctx.map.navGrid.hasClearLine(bot.x, bot.y, goal.x, goal.y)) {
      bot.setPath([goal], goal);
      return;
    }

    if (this.pathBudget <= 0) {
      // Keep drifting toward the goal until a solver slot frees up.
      if (bot.path.length === 0) bot.setPath([goal], goal);
      return;
    }
    this.pathBudget--;
    const path = this.ctx.map.navGrid.findPath(bot.x, bot.y, goal.x, goal.y);
    if (path && path.length > 0) {
      bot.setPath(path, goal);
      bot.pathFailedAt = -9999;
    } else {
      bot.pathFailedAt = this.ctx.now;
      bot.setPath([goal], goal);
    }
  }

  // ------------------------------------------------------------------ per-frame

  private act(bot: Bot, delta: number): void {
    const target = bot.target;
    const now = this.ctx.now;

    // Aim error wanders so tracking is never perfectly smooth.
    if (now > bot.nextAimJitterAt) {
      bot.nextAimJitterAt = now + this.ctx.rng.range(180, 420);
      const dist = target ? distance(bot.x, bot.y, target.x, target.y) : 300;
      const magnitude =
        bot.profile.aimErrorBase + (dist / 1000) * bot.profile.aimErrorPerUnit;
      bot.aimErrorTarget = this.ctx.rng.gaussian() * magnitude;
    }
    bot.aimError += (bot.aimErrorTarget - bot.aimError) * Math.min(1, delta / 160);
    bot.turnSpeed = bot.profile.aimTurnSpeed;

    switch (bot.state) {
      case BotState.Attack:
        this.actAttack(bot);
        break;
      case BotState.Idle:
        bot.stopMoving();
        // Sweep the aim slowly so a held position still watches its surroundings.
        bot.scanAngle += Math.sin(now * 0.0006 + bot.combatantId) * 0.012 * (delta / 16.667);
        bot.desiredAim = bot.scanAngle;
        break;
      case BotState.Heal:
        bot.stopMoving();
        if (!bot.healing) bot.state = BotState.Explore;
        if (target) bot.desiredAim = angleBetween(bot.x, bot.y, target.x, target.y);
        break;
      case BotState.TakeCover:
      case BotState.Flee: {
        const reached = bot.steerAlongPath();
        if (target) {
          bot.desiredAim = angleBetween(bot.x, bot.y, target.x, target.y) + bot.aimError;
        } else if (bot.moveInput.lengthSq() > 0.01) {
          bot.desiredAim = Math.atan2(bot.moveInput.y, bot.moveInput.x);
        }
        if (reached && bot.state === BotState.TakeCover) bot.state = BotState.Attack;
        break;
      }
      case BotState.Loot: {
        const reached = bot.steerAlongPath();
        this.faceMovement(bot);
        if (reached || (bot.destination && distance(bot.x, bot.y, bot.destination.x, bot.destination.y) < 46)) {
          if (!this.ctx.loot.tryPickup(bot)) {
            bot.lootTarget = null;
            bot.destination = null;
            bot.clearPath();
            bot.nextThinkAt = 0;
          }
        }
        break;
      }
      case BotState.MoveToZone:
      case BotState.SearchEnemy:
      case BotState.Explore:
      default: {
        const reached = bot.steerAlongPath();
        this.faceMovement(bot);
        if (reached) {
          if (bot.state === BotState.SearchEnemy) bot.investigatePoint = null;
          bot.destination = null;
          bot.nextThinkAt = Math.min(bot.nextThinkAt, now + 80);
        }
        break;
      }
    }
  }

  /**
   * A bot carrying the Signal uses its ability the way a player would: to close a gap,
   * to survive a burst, or to get out of trouble.
   */
  private maybeUseAbility(bot: Bot): void {
    const signal = this.ctx.signal;
    if (!signal.hasAbility(bot)) return;
    if (signal.cooldownRatio(bot) < 1) return;

    const healthRatio = bot.health / bot.maxHealth;
    const target = bot.target;
    const dist = target ? distance(bot.x, bot.y, target.x, target.y) : Infinity;

    switch (signal.ability.id) {
      case SignalAbility.ShieldPulse:
        if (healthRatio < 0.7 && dist < 700) signal.useAbility(bot);
        break;
      case SignalAbility.Dash:
      case SignalAbility.Teleport:
        // Charge when the target is mid-range, disengage when hurt.
        if (target && (healthRatio < bot.profile.fleeThreshold || (dist > 260 && dist < 700))) {
          if (healthRatio < bot.profile.fleeThreshold) {
            bot.desiredAim = angleBetween(target.x, target.y, bot.x, bot.y);
          }
          signal.useAbility(bot);
        }
        break;
      case SignalAbility.SpeedBoost:
        if (bot.state === BotState.MoveToZone || bot.state === BotState.Flee || dist < 600) {
          signal.useAbility(bot);
        }
        break;
      case SignalAbility.DroneScan:
        if (!target && bot.state !== BotState.Idle) signal.useAbility(bot);
        break;
      default:
        break;
    }
  }

  /** Grabs anything valuable the bot happens to be standing on. Runs at think rate. */
  private opportunisticPickup(bot: Bot): void {
    const item = this.ctx.loot.bestPickupFor(bot, 44);
    if (item) this.ctx.loot.applyPickup(bot, item);
  }

  private faceMovement(bot: Bot): void {
    if (bot.moveInput.lengthSq() > 0.01) {
      bot.desiredAim = Math.atan2(bot.moveInput.y, bot.moveInput.x);
    }
  }

  private actAttack(bot: Bot): void {
    const target = bot.target;
    if (!target || !target.alive) {
      bot.state = BotState.Explore;
      return;
    }
    const now = this.ctx.now;
    const dist = distance(bot.x, bot.y, target.x, target.y);
    const weapon = bot.weapon;

    // Lead the shot using the target's current velocity.
    const travel = weapon.base.bulletSpeed > 0 ? dist / weapon.base.bulletSpeed : 0;
    const targetBody = target.arcadeBody;
    const leadX = target.x + targetBody.velocity.x * travel * bot.profile.leadFactor;
    const leadY = target.y + targetBody.velocity.y * travel * bot.profile.leadFactor;
    bot.desiredAim = angleBetween(bot.x, bot.y, leadX, leadY) + bot.aimError;

    const anchor = { x: target.x, y: target.y };
    const strafeAmount = bot.profile.strafeAmount * (dist < weapon.base.aiIdealRange * 1.3 ? 1 : 0.4);
    if (bot.path.length > 0 && bot.pathIndex < bot.path.length) {
      bot.steerAlongPath(strafeAmount * 0.6, anchor);
    } else {
      bot.applyStrafe(anchor, strafeAmount);
    }

    if (now < bot.reactionReadyAt) return;
    if (weapon.reloading) return;

    const hasLos = this.ctx.collision.hasLineOfSight(bot.x, bot.y, target.x, target.y);
    if (!hasLos) return;
    // Hold fire outside the weapon's comfortable band: long-range poke shots would
    // otherwise turn every sighting into a duel.
    const engageRange = Math.min(weapon.base.range * 0.95, weapon.base.aiIdealRange * 1.35);
    if (dist > engageRange) return;

    const aimOff = Math.abs(angleDelta(bot.rotation, angleBetween(bot.x, bot.y, target.x, target.y)));
    // Wider tolerance up close, tighter at distance; disciplined bots hold fire longer.
    const tolerance = clamp(Math.atan2(target.radius * 1.8, Math.max(40, dist)), 0.035, 0.5);
    if (aimOff > tolerance * (1.6 - bot.profile.discipline)) return;

    if (now < bot.fireReadyAt) return;
    if (!weapon.base.auto && weapon.base.burst <= 1) {
      // Simulate a human trigger finger on semi-automatics.
      bot.fireReadyAt = now + this.ctx.rng.range(60, 220);
    }

    this.ctx.combat.tryFire(bot, { held: true, pressed: true });
  }

  /** Debug helper. */
  describe(bot: Bot): string {
    const targetName = bot.target ? bot.target.combatantName : '-';
    return `${bot.state}/${bot.stateNote} -> ${targetName}`;
  }
}
