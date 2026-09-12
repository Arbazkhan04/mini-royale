import Phaser from 'phaser';
import { BOT_AI } from '../config/BotConfig';
import type { BotProfile } from '../config/BotConfig';
import { PALETTE } from '../config/GameConfig';
import { BotState, Depth } from '../utils/Constants';
import type { Vec2 } from '../utils/Constants';
import { angleBetween, clamp, distance } from '../utils/MathUtils';
import type { MatchContext } from '../systems/MatchContext';
import { Combatant } from './Combatant';
import type { CombatantOptions } from './Combatant';

/**
 * AI combatant. This class owns *state and motion*; the decision making lives in
 * BotAISystem so the two can be tuned (or replaced by a network peer) independently.
 */
export class Bot extends Combatant {
  /** GameObject.state is widened by Phaser; the override keeps the enum type. */
  override state: BotState = BotState.Explore;
  /** Human-readable reason for the current state, surfaced in debug mode. */
  stateNote = '';

  target: Combatant | null = null;
  targetLastSeenAt = -9999;
  readonly targetLastKnownPos: Vec2 = { x: 0, y: 0 };
  /** Where the bot heard something worth investigating. */
  investigatePoint: Vec2 | null = null;

  lootTarget: Vec2 | null = null;
  destination: Vec2 | null = null;
  coverPoint: Vec2 | null = null;

  path: Vec2[] = [];
  pathIndex = 0;
  pathGoal: Vec2 | null = null;
  pathFailedAt = -9999;

  nextThinkAt = 0;
  /** While set, this bot reacts slowly - used to ease new players into their first fights. */
  gentleUntil = 0;
  /** Set when a Signal broadcast or a supply drop is worth walking to. */
  objectivePoint: Vec2 | null = null;
  objectiveUntil = 0;
  nextRetargetAt = 0;
  reactionReadyAt = 0;
  exploreUntil = 0;
  /** While holding an area the bot stands still and scans. */
  idleUntil = 0;
  scanAngle = 0;
  /** Randomised trigger delay so semi-auto bots do not shoot with machine precision. */
  fireReadyAt = 0;
  aimError = 0;
  aimErrorTarget = 0;
  nextAimJitterAt = 0;
  strafeDir = 1;
  nextStrafeFlipAt = 0;

  private lastProgressPos: Vec2 = { x: 0, y: 0 };
  private lastProgressAt = 0;
  private unstickUntil = 0;
  private unstickAngle = 0;

  private readonly plate: Phaser.GameObjects.Container;
  private readonly plateBarBg: Phaser.GameObjects.Rectangle;
  private readonly plateBar: Phaser.GameObjects.Rectangle;
  private readonly plateText: Phaser.GameObjects.Text;

  constructor(
    ctx: MatchContext,
    opts: CombatantOptions,
    readonly profile: BotProfile,
  ) {
    super(ctx, opts);
    this.lastProgressPos = { x: opts.x, y: opts.y };
    this.lastProgressAt = ctx.now;
    this.strafeDir = ctx.rng.sign();

    const scene = ctx.scene;
    this.plateText = scene.add
      .text(0, -12, opts.name, {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '11px',
        color: '#e8eef5',
      })
      .setOrigin(0.5, 1);
    this.plateText.setShadow(0, 1, '#000000', 2, false, true);
    this.plateBarBg = scene.add.rectangle(0, -6, 34, 5, 0x101820, 0.75).setOrigin(0.5, 0.5);
    this.plateBar = scene.add.rectangle(-16, -6, 32, 3, 0x5fd36b, 1).setOrigin(0, 0.5);
    this.plate = scene.add.container(opts.x, opts.y - 30, [
      this.plateBarBg,
      this.plateBar,
      this.plateText,
    ]);
    this.plate.setDepth(Depth.Effect - 1);
  }

  override update(time: number, delta: number): void {
    if (!this.alive) return;
    super.update(time, delta);
    this.updateStuckTracking();
    this.updatePlate();
  }

  // ------------------------------------------------------------------ motion

  /** Clears the current path so the AI recomputes on its next think. */
  clearPath(): void {
    this.path.length = 0;
    this.pathIndex = 0;
    this.pathGoal = null;
  }

  setPath(points: Vec2[], goal: Vec2): void {
    this.path = points;
    this.pathIndex = 0;
    this.pathGoal = { x: goal.x, y: goal.y };
  }

  get currentWaypoint(): Vec2 | null {
    if (this.pathIndex >= this.path.length) return null;
    return this.path[this.pathIndex] as Vec2;
  }

  /**
   * Steers along the active path. `strafe` blends in lateral movement used while
   * fighting. Returns true when the path has been consumed.
   */
  steerAlongPath(strafe = 0, strafeAnchor: Vec2 | null = null): boolean {
    const wp = this.currentWaypoint;
    if (!wp) {
      if (strafe !== 0 && strafeAnchor) this.applyStrafe(strafeAnchor, strafe);
      else this.moveInput.set(0, 0);
      return true;
    }
    const dist = distance(this.x, this.y, wp.x, wp.y);
    if (dist < BOT_AI.arriveRadius) {
      this.pathIndex++;
      return this.pathIndex >= this.path.length;
    }
    const angle = angleBetween(this.x, this.y, wp.x, wp.y);
    let dx = Math.cos(angle);
    let dy = Math.sin(angle);

    if (strafe !== 0 && strafeAnchor) {
      const toTarget = angleBetween(this.x, this.y, strafeAnchor.x, strafeAnchor.y);
      dx += Math.cos(toTarget + Math.PI / 2) * strafe * this.strafeDir;
      dy += Math.sin(toTarget + Math.PI / 2) * strafe * this.strafeDir;
    }

    const avoid = this.ctx.collision.avoidanceVector(this.x, this.y, this.radius + 16);
    dx += avoid.x;
    dy += avoid.y;

    if (this.ctx.now < this.unstickUntil) {
      dx += Math.cos(this.unstickAngle) * 1.2;
      dy += Math.sin(this.unstickAngle) * 1.2;
    }

    const len = Math.hypot(dx, dy) || 1;
    this.moveInput.set(dx / len, dy / len);
    return false;
  }

  /** Pure lateral circling used when the bot is already in position. */
  applyStrafe(anchor: Vec2, amount: number): void {
    const toTarget = angleBetween(this.x, this.y, anchor.x, anchor.y);
    let dx = Math.cos(toTarget + Math.PI / 2) * this.strafeDir * amount;
    let dy = Math.sin(toTarget + Math.PI / 2) * this.strafeDir * amount;
    const avoid = this.ctx.collision.avoidanceVector(this.x, this.y, this.radius + 16);
    dx += avoid.x;
    dy += avoid.y;
    const len = Math.hypot(dx, dy) || 1;
    this.moveInput.set(dx / len, dy / len);
  }

  stopMoving(): void {
    this.moveInput.set(0, 0);
  }

  private updateStuckTracking(): void {
    const now = this.ctx.now;
    const moved = distance(this.x, this.y, this.lastProgressPos.x, this.lastProgressPos.y);
    if (moved > BOT_AI.stuckDistance) {
      this.lastProgressPos = { x: this.x, y: this.y };
      this.lastProgressAt = now;
      return;
    }
    const wantsToMove = this.moveInput.lengthSq() > 0.05;
    if (wantsToMove && now - this.lastProgressAt > BOT_AI.stuckMs && now > this.unstickUntil) {
      // Commit to a sidestep for a moment and force a fresh path next think.
      this.unstickAngle = this.rotation + this.ctx.rng.range(-Math.PI, Math.PI);
      this.unstickUntil = now + this.ctx.rng.range(320, 620);
      this.lastProgressAt = now;
      this.lastProgressPos = { x: this.x, y: this.y };
      this.clearPath();
    }
  }

  private updatePlate(): void {
    const player = this.ctx.player;
    const dist = player ? distance(this.x, this.y, player.x, player.y) : 0;
    const visible = dist < 760;
    this.plate.setVisible(visible);
    if (!visible) return;
    this.plate.setPosition(this.x, this.y - 30);
    const ratio = clamp(this.health / this.maxHealth, 0, 1);
    this.plateBar.width = 32 * ratio;
    this.plateBar.fillColor = ratio > 0.6 ? 0x5fd36b : ratio > 0.3 ? PALETTE.gold : PALETTE.danger;
    this.plate.setAlpha(clamp(1 - (dist - 520) / 240, 0.25, 1));
  }

  protected override onDeath(): void {
    this.plate.destroy();
    this.state = BotState.Dead;
  }

  override destroy(fromScene?: boolean): void {
    this.plate.destroy();
    super.destroy(fromScene);
  }
}
