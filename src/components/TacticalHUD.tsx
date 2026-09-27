import React, { useState, useEffect } from 'react';
import { GameHUDState } from '../game/gameEngine';
import { sound } from '../game/audio';
import confetti from 'canvas-confetti';
import {
  Shield,
  Heart,
  Crosshair,
  Volume2,
  VolumeX,
  Code2,
  Download,
  Copy,
  Check,
  RotateCcw,
  Zap,
  Target,
  Users,
  Compass,
  Radio
} from 'lucide-react';
import { STANDALONE_HTML_GAME } from '../game/standaloneCode';

interface TacticalHUDProps {
  hudState: GameHUDState;
  onDeploy: () => void;
  onRestart: () => void;
  onSwitchWeapon: (idx: number) => void;
}

export const TacticalHUD: React.FC<TacticalHUDProps> = ({
  hudState,
  onDeploy,
  onRestart,
  onSwitchWeapon,
}) => {
  const [isMuted, setIsMuted] = useState(sound.getMuted());
  const [showExportModal, setShowExportModal] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  // Victory confetti trigger
  useEffect(() => {
    if (hudState.isVictory) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#06b6d4', '#38bdf8', '#fbbf24', '#ffffff'],
      });
    }
  }, [hudState.isVictory]);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    sound.setMuted(next);
  };

  const copyStandaloneCode = () => {
    navigator.clipboard.writeText(STANDALONE_HTML_GAME);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2500);
  };

  const downloadStandaloneFile = () => {
    const blob = new Blob([STANDALONE_HTML_GAME], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'frontline-reality-standalone.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Cardinal direction label based on compass heading
  const getCardinal = (heading: number): string => {
    const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.floor(((heading + 22.5) % 360) / 45);
    return cardinals[idx];
  };

  // Mini-map radar canvas renderer
  const renderMinimapCanvas = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radarRange = 500; // 500 meters displayed
    const scale = (center - 10) / radarRange;

    ctx.clearRect(0, 0, size, size);

    // Radar circular background
    ctx.fillStyle = 'rgba(11, 15, 20, 0.85)';
    ctx.beginPath();
    ctx.arc(center, center, center - 4, 0, Math.PI * 2);
    ctx.fill();

    // Range rings
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center, center, (center - 10) * 0.4, 0, Math.PI * 2);
    ctx.arc(center, center, (center - 10) * 0.75, 0, Math.PI * 2);
    ctx.arc(center, center, center - 10, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs on radar
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.beginPath();
    ctx.moveTo(center, 8);
    ctx.lineTo(center, size - 8);
    ctx.moveTo(8, center);
    ctx.lineTo(size - 8, center);
    ctx.stroke();

    const px = hudState.playerPos.x;
    const pz = hudState.playerPos.z;

    // Draw Military Outposts on radar
    ctx.fillStyle = '#64748b';
    for (const op of hudState.outpostPositions) {
      const rx = center + (op.x - px) * scale;
      const rz = center + (op.z - pz) * scale;
      if (Math.hypot(rx - center, rz - center) < center - 8) {
        ctx.fillRect(rx - 2.5, rz - 2.5, 5, 5);
      }
    }

    // Draw Shrinking Storm Zone circle
    const stormOX = center + (hudState.stormCenter.x - px) * scale;
    const stormOZ = center + (hudState.stormCenter.y - pz) * scale;
    const stormR = hudState.stormRadius * scale;

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(stormOX, stormOZ, Math.max(2, stormR), 0, Math.PI * 2);
    ctx.stroke();

    // Hostile Enemy AI Bots
    ctx.fillStyle = '#ef4444';
    for (const bot of hudState.botRadarPositions) {
      if (bot.isDead) continue;
      const bx = center + (bot.x - px) * scale;
      const bz = center + (bot.z - pz) * scale;
      if (Math.hypot(bx - center, bz - center) < center - 8) {
        ctx.beginPath();
        ctx.arc(bx, bz, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Player Drone Arrow in center
    ctx.save();
    ctx.translate(center, center);
    // Heading in radians
    const headingRad = (hudState.compassHeading * Math.PI) / 180;
    ctx.rotate(-headingRad);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const shieldPercent = Math.max(0, Math.min(100, (hudState.shield / hudState.maxShield) * 100));
  const healthPercent = Math.max(0, Math.min(100, (hudState.health / hudState.maxHealth) * 100));

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-20 flex flex-col justify-between p-4 md:p-6">
      {/* Storm Vignette Warning Screen Flash */}
      {hudState.isInStorm && (
        <div className="absolute inset-0 pointer-events-none z-10 border-[16px] border-cyan-500/40 animate-pulse bg-cyan-900/10 shadow-[inset_0_0_120px_rgba(6,182,212,0.45)]" />
      )}

      {/* TOP HEADER & COMPASS */}
      <div className="flex items-start justify-between w-full">
        {/* Top-Left: Match Info & Controls */}
        <div className="flex flex-col gap-2 pointer-events-auto">
          <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3.5 py-1.5 rounded-lg border border-slate-700/60 shadow-lg text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5 text-cyan-400 font-bold tracking-wider">
              <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
              FRONTLINE REALITY
            </span>
            <span className="text-slate-600">·</span>
            <span className="flex items-center gap-1 text-amber-400">
              <Users className="w-3.5 h-3.5" />
              ALIVE: {hudState.aliveCount} / {hudState.totalEnemies + 1}
            </span>
            <span className="text-slate-600">·</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <Target className="w-3.5 h-3.5" />
              KILLS: {hudState.playerKills}
            </span>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleMute}
              className="p-1.5 bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded border border-slate-700/60 transition-colors"
              title={isMuted ? "Unmute Audio" : "Mute Audio"}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900/80 hover:bg-slate-800 text-xs font-semibold text-cyan-400 hover:text-cyan-300 rounded border border-cyan-500/40 transition-colors shadow-sm"
              title="Copy / Export Standalone Single-File HTML"
            >
              <Code2 className="w-3.5 h-3.5" />
              Single-File HTML
            </button>
          </div>
        </div>

        {/* Center: Tactical Compass Tape & Storm Countdown */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2 bg-slate-950/85 backdrop-blur-md px-6 py-1.5 rounded-lg border border-cyan-500/40 shadow-xl">
            <Compass className="w-4 h-4 text-cyan-400 animate-spin-slow" />
            <div className="font-mono-tactical text-base font-bold tracking-widest text-cyan-400">
              {getCardinal(hudState.compassHeading)} {hudState.compassHeading.toString().padStart(3, '0')}°
            </div>
          </div>

          <div
            className={`mt-1.5 px-3 py-0.5 rounded text-[11px] font-bold tracking-widest uppercase border backdrop-blur-md ${
              hudState.isInStorm
                ? 'bg-red-500/20 text-red-400 border-red-500/60 animate-pulse'
                : hudState.isStormShrinking
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
            }`}
          >
            {hudState.isInStorm
              ? 'WARNING: RADIATION DAMAGE'
              : hudState.isStormShrinking
              ? `ZONE COLLAPSING: ${hudState.stormTimeRemaining}s`
              : `SAFE ZONE EXPIRING: ${hudState.stormTimeRemaining}s`}
          </div>
        </div>

        {/* Top-Right: Mini-Map Radar Layout */}
        <div className="relative">
          <div className="w-40 h-40 rounded-full border-2 border-cyan-400/40 bg-slate-950/85 backdrop-blur-md overflow-hidden shadow-2xl relative">
            <canvas
              ref={renderMinimapCanvas}
              width={160}
              height={160}
              className="w-full h-full"
            />
            {/* Radar scanner sweep line */}
            <div className="absolute inset-0 pointer-events-none animate-radar-sweep border-r border-cyan-400/30 bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent" />
          </div>
          <div className="text-[10px] text-center font-mono-tactical text-slate-400 mt-1 tracking-wider uppercase">
            TAC-RADAR &middot; 500M
          </div>
        </div>
      </div>

      {/* KILL FEED (Upper Left) */}
      <div className="w-72 flex flex-col gap-1.5 mt-2">
        {hudState.killFeed.map((item) => (
          <div
            key={item.id}
            className={`px-2.5 py-1 rounded text-xs font-mono-tactical backdrop-blur-md border-l-4 transition-all duration-300 ${
              item.isPlayerKill
                ? 'bg-emerald-950/70 border-emerald-400 text-emerald-200'
                : 'bg-slate-900/80 border-cyan-500/60 text-slate-300'
            }`}
          >
            <span className={item.isPlayerKill ? 'text-emerald-300 font-bold' : 'text-slate-400'}>
              {item.killer}
            </span>
            <span className="text-slate-500 mx-1.5">»</span>
            <span className="text-slate-200 font-medium">{item.victim}</span>
          </div>
        ))}
      </div>

      {/* DYNAMIC CENTER RETICLE / CROSSHAIR */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="relative w-12 h-12 flex items-center justify-center">
          {/* Center aiming pip */}
          <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full shadow-[0_0_8px_#38bdf8]" />

          {/* Crosshair tines */}
          <div className={`absolute top-1 w-0.5 bg-cyan-400/80 transition-all ${hudState.isADS ? 'h-2' : 'h-3'}`} />
          <div className={`absolute bottom-1 w-0.5 bg-cyan-400/80 transition-all ${hudState.isADS ? 'h-2' : 'h-3'}`} />
          <div className={`absolute left-1 h-0.5 bg-cyan-400/80 transition-all ${hudState.isADS ? 'w-2' : 'w-3'}`} />
          <div className={`absolute right-1 h-0.5 bg-cyan-400/80 transition-all ${hudState.isADS ? 'w-2' : 'w-3'}`} />

          {/* ADS lock indicator */}
          {hudState.isADS && (
            <div className="absolute inset-0 border border-cyan-400/40 rounded-full animate-pulse" />
          )}
        </div>
      </div>

      {/* BOTTOM TACTICAL BAR (Health/Shield & Weapons) */}
      <div className="flex items-end justify-between w-full">
        {/* Bottom-Left: Vitals (Shield & Hull Integrity) */}
        <div className="w-72 bg-slate-950/80 backdrop-blur-md p-3.5 rounded-lg border border-slate-700/60 shadow-2xl">
          {/* Shield Bar */}
          <div className="mb-2.5">
            <div className="flex items-center justify-between text-xs font-bold tracking-wider mb-1">
              <span className="flex items-center gap-1.5 text-cyan-400">
                <Shield className="w-3.5 h-3.5" />
                SHIELD OVERCHARGE
              </span>
              <span className="font-mono-tactical text-cyan-300">{hudState.shield}</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden p-0.5">
              <div
                className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all duration-150"
                style={{ width: `${shieldPercent}%` }}
              />
            </div>
          </div>

          {/* Hull Integrity Health Bar */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold tracking-wider mb-1">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Heart className="w-3.5 h-3.5" />
                HULL INTEGRITY
              </span>
              <span className="font-mono-tactical text-emerald-300">{hudState.health}</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-150 ${
                  healthPercent < 30
                    ? 'bg-gradient-to-r from-red-600 to-red-400 animate-pulse'
                    : 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                }`}
                style={{ width: `${healthPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Bottom-Right: Tactical Weapon & Ammo Panel */}
        <div className="bg-slate-950/80 backdrop-blur-md px-5 py-3.5 rounded-lg border border-slate-700/60 shadow-2xl text-right">
          <div className="flex items-center justify-end gap-2 mb-1 pointer-events-auto">
            <button
              onClick={() => onSwitchWeapon(0)}
              className={`px-2 py-0.5 text-[11px] font-bold rounded transition-colors ${
                hudState.weaponIndex === 0
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              [1] PULSE
            </button>
            <button
              onClick={() => onSwitchWeapon(1)}
              className={`px-2 py-0.5 text-[11px] font-bold rounded transition-colors ${
                hudState.weaponIndex === 1
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              [2] RAILGUN
            </button>
          </div>

          <div className="text-xs font-bold tracking-widest text-slate-400 uppercase">
            {hudState.weaponName}
          </div>

          <div className="flex items-baseline justify-end gap-1.5 font-mono-tactical">
            <span
              className={`text-3xl font-extrabold tracking-tight ${
                hudState.isReloading
                  ? 'text-amber-400 animate-pulse text-xl'
                  : hudState.ammo <= 5
                  ? 'text-red-400 animate-pulse'
                  : 'text-cyan-400'
              }`}
            >
              {hudState.isReloading ? 'RELOADING...' : hudState.ammo}
            </span>
            {!hudState.isReloading && (
              <span className="text-sm font-semibold text-slate-500">
                / {hudState.maxAmmo}
              </span>
            )}
          </div>

          <div className="text-[10px] text-slate-500 tracking-wider mt-0.5">
            [L-CLICK] FIRE &middot; [R-CLICK] ADS ZOOM &middot; [R] RELOAD
          </div>
        </div>
      </div>

      {/* START / DEPLOYMENT OVERLAY */}
      {!hudState.isLocked && !hudState.isGameOver && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center pointer-events-auto z-40">
          <div className="max-w-lg w-full mx-4 bg-slate-900 border border-cyan-500/40 p-8 rounded-xl shadow-2xl text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold tracking-wider mb-4">
              <Zap className="w-3.5 h-3.5" />
              ULTRA-REALISTIC 3D TACTICAL BATTLEGROUND
            </div>

            <h1 className="text-3xl font-extrabold tracking-wider text-slate-100 uppercase mb-2">
              FRONTLINE REALITY
            </h1>

            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              Control a sleek combat drone with high-velocity laser weaponry. Navigate 40 multi-story concrete military outposts with climbable sniping rooftops and eliminate 25 aggressive hunter bots before the radioactive storm collapses!
            </p>

            <button
              onClick={onDeploy}
              className="w-full py-3.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-bold tracking-widest rounded-lg shadow-lg shadow-cyan-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 uppercase"
            >
              DEPLOY DRONE (LOCK MOUSE)
            </button>

            {/* Controls Cheatsheet */}
            <div className="grid grid-cols-2 gap-2 mt-6 pt-5 border-t border-slate-800 text-xs text-left text-slate-300">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono-tactical text-cyan-400 border border-slate-700">W,A,S,D</span>
                <span>Flight Vector</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono-tactical text-cyan-400 border border-slate-700">MOUSE</span>
                <span>Third-Person Aim</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono-tactical text-cyan-400 border border-slate-700">L-CLICK</span>
                <span>Laser Cannon</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono-tactical text-cyan-400 border border-slate-700">R-CLICK</span>
                <span>Tactical ADS Zoom</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono-tactical text-cyan-400 border border-slate-700">SPACE</span>
                <span>Jetpack Boost</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono-tactical text-cyan-400 border border-slate-700">1 / 2</span>
                <span>Pulse / Railgun</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER / VICTORY MODAL */}
      {hudState.isGameOver && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center pointer-events-auto z-40">
          <div className="max-w-md w-full mx-4 bg-slate-900 border border-slate-700 p-8 rounded-xl shadow-2xl text-center">
            {hudState.isVictory ? (
              <>
                <div className="w-14 h-14 mx-auto rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center mb-4 border border-cyan-500/40">
                  <Target className="w-8 h-8" />
                </div>
                <h2 className="text-3xl font-extrabold tracking-wider text-cyan-400 uppercase mb-1">
                  VICTORY ACHIEVED
                </h2>
                <p className="text-xs text-slate-400 mb-6">
                  All 25 hostile combat hunter drones neutralized. Sector secured.
                </p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 mx-auto rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-4 border border-red-500/40">
                  <Shield className="w-8 h-8" />
                </div>
                <h2 className="text-3xl font-extrabold tracking-wider text-red-400 uppercase mb-1">
                  DRONE DESTROYED
                </h2>
                <p className="text-xs text-slate-400 mb-6">
                  Combat frame suffered catastrophic damage on the frontline.
                </p>
              </>
            )}

            {/* Combat Debriefing Metrics */}
            <div className="grid grid-cols-3 gap-2 bg-slate-950/80 p-3.5 rounded-lg border border-slate-800 mb-6 font-mono-tactical">
              <div>
                <div className="text-[11px] text-slate-500 uppercase">Kills</div>
                <div className="text-xl font-bold text-slate-100">{hudState.playerKills}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 uppercase">Damage</div>
                <div className="text-xl font-bold text-cyan-400">{hudState.damageDealt}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 uppercase">Remaining</div>
                <div className="text-xl font-bold text-amber-400">{hudState.aliveCount}</div>
              </div>
            </div>

            <button
              onClick={onRestart}
              className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-bold tracking-widest rounded-lg shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 uppercase"
            >
              <RotateCcw className="w-4 h-4" />
              RE-DEPLOY DRONE
            </button>
          </div>
        </div>
      )}

      {/* STANDALONE SINGLE-FILE HTML MODAL */}
      {showExportModal && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center pointer-events-auto z-50">
          <div className="max-w-2xl w-full mx-4 bg-slate-900 border border-cyan-500/50 p-6 rounded-xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-slate-100 tracking-wide">
                  Complete Standalone Single-File HTML5 Game
                </h3>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold px-2 py-1 rounded hover:bg-slate-800"
              >
                ✕ Close
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Contains all HTML, CSS, procedural noise terrain, 40 multi-story military outposts, 25 AI bots, shrinking storm zone, and Web Audio synthesizer inside a single self-contained file with Three.js via CDN. You can copy, paste, or download it to run offline anywhere!
            </p>

            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={copyStandaloneCode}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold rounded-lg transition-colors shadow-md"
              >
                {hasCopied ? <Check className="w-4 h-4 text-emerald-950" /> : <Copy className="w-4 h-4" />}
                {hasCopied ? "COPIED TO CLIPBOARD!" : "COPY ENTIRE HTML CODE"}
              </button>
              <button
                onClick={downloadStandaloneFile}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-colors"
              >
                <Download className="w-4 h-4 text-cyan-400" />
                DOWNLOAD .HTML FILE
              </button>
            </div>

            <div className="flex-1 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 p-3 relative font-mono-tactical text-[11px] text-slate-300">
              <pre className="overflow-auto h-full max-h-72">
                <code>{STANDALONE_HTML_GAME.substring(0, 1800)}...{"\n"}/* [Complete 800+ lines of standalone code ready to run] */</code>
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
