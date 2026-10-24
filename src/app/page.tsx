'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Star,
  Flame,
  Trophy,
  RotateCcw,
  Volume2,
  VolumeX,
  HelpCircle,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Mascot, type MascotMood } from '@/components/kiyan/mascot';
import { Confetti } from '@/components/kiyan/confetti';
import { parseSpokenMath, speak, type ParseResult } from '@/lib/mathParser';

// ---- Speech Recognition typings (not in lib.dom.d.ts) ----
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const ENCOURAGEMENTS = [
  'Awesome!',
  'Brilliant!',
  'Way to go!',
  'Super!',
  'Fantastic!',
  'Great job!',
  'Woohoo!',
  'Excellent!',
  'Amazing!',
  'You rock!',
  'High five!',
  'Math star!',
];

const EXAMPLE_PHRASES: { label: string; text: string }[] = [
  { label: '5 + 3', text: 'five plus three' },
  { label: '10 − 4', text: 'ten minus four' },
  { label: '6 × 7', text: 'six times seven' },
  { label: '20 ÷ 4', text: 'twenty divided by four' },
  { label: '12 + 8', text: 'twelve plus eight' },
  { label: '9 × 9', text: 'nine times nine' },
  { label: '25 − 5', text: 'twenty five minus five' },
  { label: '100 + 50', text: 'one hundred plus fifty' },
];

const RAINBOW_COLORS = [
  'text-orange-500',
  'text-amber-500',
  'text-pink-500',
  'text-purple-500',
  'text-green-500',
  'text-rose-500',
  'text-yellow-500',
];

interface DisplayState {
  expression: string;
  result: number | null;
  message: string;
  error?: string;
  transcript: string;
}

const STORAGE_KEY = 'kiyan-state-v1';

interface SavedState {
  score: number;
  bestStreak: number;
  solved: number;
}

// Cached default snapshot for SSR (must be stable to avoid useSyncExternalStore infinite loop)
const DEFAULT_SAVED_STATE: SavedState = { score: 0, bestStreak: 0, solved: 0 };

// Module-level cache of the last seen snapshot. useSyncExternalStore requires
// getSnapshot to return the SAME reference if nothing changed; otherwise it
// re-renders infinitely. We compute the snapshot once and only swap the
// reference when the underlying localStorage value actually changes.
let cachedSavedState: SavedState = DEFAULT_SAVED_STATE;

function readSavedStateRaw(): SavedState {
  if (typeof window === 'undefined') return DEFAULT_SAVED_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SAVED_STATE;
    const parsed = JSON.parse(raw) as Partial<SavedState>;
    return {
      score: parsed.score ?? 0,
      bestStreak: parsed.bestStreak ?? 0,
      solved: parsed.solved ?? 0,
    };
  } catch {
    return DEFAULT_SAVED_STATE;
  }
}

/**
 * Returns the cached snapshot of saved state, swapping the cache when the
 * underlying values change. This stable-reference pattern keeps
 * useSyncExternalStore happy.
 */
function getSavedSnapshot(): SavedState {
  if (typeof window === 'undefined') return DEFAULT_SAVED_STATE;
  const next = readSavedStateRaw();
  if (
    cachedSavedState.score !== next.score ||
    cachedSavedState.bestStreak !== next.bestStreak ||
    cachedSavedState.solved !== next.solved
  ) {
    cachedSavedState = next;
  }
  return cachedSavedState;
}

function RainbowText({ text, className }: { text: string; className?: string }) {
  const chars = text.split('');
  return (
    <span className={className} aria-label={text}>
      {chars.map((c, i) => (
        <span
          key={i}
          className={c.trim() === '' ? '' : RAINBOW_COLORS[i % RAINBOW_COLORS.length]}
          aria-hidden
        >
          {c}
        </span>
      ))}
    </span>
  );
}

export default function Home() {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [display, setDisplay] = useState<DisplayState | null>(null);
  const [mood, setMood] = useState<MascotMood>('idle');
  // Score, bestStreak, solved are the source of truth from localStorage
  // (SSR-safe via useSyncExternalStore). Writes go through `updateSaved`.
  const subscribeSaved = useCallback((cb: () => void) => {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('storage', cb);
    window.addEventListener('kiyan-state-updated', cb);
    return () => {
      window.removeEventListener('storage', cb);
      window.removeEventListener('kiyan-state-updated', cb);
    };
  }, []);
  const savedState = useSyncExternalStore(
    subscribeSaved,
    getSavedSnapshot,
    () => DEFAULT_SAVED_STATE
  );
  const { score, bestStreak, solved } = savedState;
  // Streak is session-only, not persisted.
  const [streak, setStreak] = useState(0);
  const [confettiRun, setConfettiRun] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState<string | null>(null);
  const [hintIndex, setHintIndex] = useState(0);
  const recRef = useRef<SpeechRecognition | null>(null);
  // Speech is queued here during a voice session and spoken only AFTER the
  // recognition session has fully ended. Speaking while the mic is open makes
  // the recognizer transcribe the app's own voice — a major source of
  // "recognition not working" complaints.
  const pendingSpeechRef = useRef<string | null>(null);
  // Auto-returns the result card to the ready state so the app is always
  // fresh for the next command.
  const autoClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when the user deliberately stops listening, so the trailing
  // 'no-speech' error is suppressed instead of popping an error card.
  const stopRequestedRef = useRef(false);

  // Helper that writes to localStorage and notifies subscribers.
  const updateSaved = useCallback((updater: (prev: SavedState) => SavedState) => {
    if (typeof window === 'undefined') return;
    try {
      const current = readSavedStateRaw();
      const next = updater(current);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event('kiyan-state-updated'));
    } catch {
      /* ignore */
    }
  }, []);

  // Detect support for SpeechRecognition (SSR-safe via useSyncExternalStore)
  const supported = useSyncExternalStore(
    () => () => {},
    () =>
      typeof window !== 'undefined' &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    () => false
  );

  // Preload TTS voices (Chrome often loads them asynchronously)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.getVoices();
    const handler = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', handler);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', handler);
  }, []);

  // Rotate the hint every few seconds when idle
  useEffect(() => {
    if (mood !== 'idle') return;
    const t = setInterval(() => {
      setHintIndex((i) => (i + 1) % EXAMPLE_PHRASES.length);
    }, 3500);
    return () => clearInterval(t);
  }, [mood]);

  // Cancel any pending auto-clear timer.
  const cancelAutoClear = useCallback(() => {
    if (autoClearRef.current) {
      clearTimeout(autoClearRef.current);
      autoClearRef.current = null;
    }
  }, []);

  // Full reset so the next voice command starts from a clean slate.
  const resetForNewCommand = useCallback(() => {
    cancelAutoClear();
    setDisplay(null);
    setInterim('');
    setMood('idle');
  }, [cancelAutoClear]);

  // Show a friendly error card, then auto-refresh to the ready state.
  const showErrorCard = useCallback(
    (message: string, error?: string) => {
      cancelAutoClear();
      setMood('oops');
      setDisplay({ expression: '', result: null, message, transcript: '', error });
      autoClearRef.current = setTimeout(() => {
        setDisplay(null);
        setInterim('');
        setMood((m) => (m === 'oops' ? 'idle' : m));
      }, 6000);
    },
    [cancelAutoClear]
  );

  const handleResult = useCallback(
    (parsed: ParseResult, transcript: string, fromVoice: boolean) => {
      cancelAutoClear();

      // Queue speech (voice path) or speak immediately (button path).
      const say = (text: string) => {
        if (muted) return;
        if (fromVoice) {
          pendingSpeechRef.current = pendingSpeechRef.current
            ? `${pendingSpeechRef.current} ${text}`
            : text;
        } else {
          speak(text, { pitch: 1.3, rate: 0.95 });
        }
      };

      if (parsed.result === null || parsed.expression === '') {
        setStreak(0);
        showErrorCard(parsed.error ?? "I didn't hear that!", parsed.error);
        say(parsed.error ?? 'Oops! Try again, buddy!');
        return;
      }

      const message = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
      setDisplay({
        expression: parsed.expression,
        result: parsed.result,
        message,
        transcript,
      });
      setMood('happy');
      setConfettiRun((r) => r + 1);

      // Speak the result (queued until the mic is off for voice input).
      say(spokenResultText(parsed));

      // Gamification: +10 per correct solve, +streak bonus.
      // Persist score / bestStreak / solved via localStorage.
      const newStreak = streak + 1;
      setStreak(newStreak);
      updateSaved((s) => ({
        score: s.score + 10 + streak,
        bestStreak: Math.max(s.bestStreak, newStreak),
        solved: s.solved + 1,
      }));
      // Level-up celebration every 5 streak
      if (newStreak > 0 && newStreak % 5 === 0) {
        setShowLevelUp(`Streak ${newStreak}! 🔥`);
        say(`Wow! Streak of ${newStreak}! You are a math star!`);
        setTimeout(() => setShowLevelUp(null), 2500);
      }

      // Auto-refresh back to the ready state shortly after the celebration,
      // so the next command always starts clean.
      autoClearRef.current = setTimeout(() => {
        setDisplay(null);
        setInterim('');
        setMood((m) => (m === 'happy' ? 'idle' : m));
      }, 8000);

      // Return to idle after a beat
      setTimeout(() => {
        setMood((m) => (m === 'happy' ? 'idle' : m));
      }, 2200);
    },
    [streak, muted, updateSaved, cancelAutoClear, showErrorCard]
  );

  const startListening = useCallback(() => {
    if (typeof window === 'undefined') return;
    const ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!ctor) return;

    // Stop any existing instance
    if (recRef.current) {
      try {
        recRef.current.abort();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    }

    const rec = new ctor();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    rec.onstart = () => {
      stopRequestedRef.current = false;
      pendingSpeechRef.current = null;
      setListening(true);
      setMood('listening');
      setInterim('');
      // Clear the previous result so the "Listening…" card is always visible.
      setDisplay(null);
      // NOTE: no TTS here on purpose — speaking while the mic is open makes
      // the recognizer hear the app's own voice.
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = '';
      let finalEvent: SpeechRecognitionResult | null = null;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal && !finalEvent) finalEvent = r;
        else if (!r.isFinal) interimText += r[0].transcript;
      }
      if (interimText) setInterim(interimText);
      if (finalEvent) {
        setInterim('');
        const transcript = finalEvent[0].transcript.trim();
        // Try each alternative until one parses cleanly — this makes
        // recognition far more forgiving of misheard words.
        let parsed = parseSpokenMath(transcript);
        for (let a = 1; a < finalEvent.length; a++) {
          if (parsed.result !== null) break;
          const altParsed = parseSpokenMath(finalEvent[a].transcript.trim());
          if (altParsed.result !== null) {
            parsed = { ...altParsed, spokenInput: transcript };
          }
        }
        handleResult(parsed, transcript, true);
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      setListening(false);
      if (event.error === 'aborted') {
        // User cancelled — UI already reset, stay quiet.
        return;
      }
      if (stopRequestedRef.current && event.error === 'no-speech') {
        // Deliberate stop with nothing said — keep the clean refreshed state.
        return;
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        showErrorCard(
          'Microphone is blocked! Ask a grown-up to open this app in a new browser tab, then allow the mic.',
          'mic-blocked'
        );
      } else if (event.error === 'no-speech') {
        showErrorCard("I didn't hear anything — tap the mic and try again!");
      } else if (event.error === 'network') {
        showErrorCard(
          'The speech service is not reachable right now. Try again, or use the buttons below!'
        );
      } else {
        showErrorCard(`Oops: ${event.error}. Try again!`);
      }
    };

    rec.onend = () => {
      setListening(false);
      stopRequestedRef.current = false;
      setMood((m) => (m === 'listening' ? 'idle' : m));
      // The mic is fully off now — speak anything queued during the session.
      const queued = pendingSpeechRef.current;
      pendingSpeechRef.current = null;
      if (queued) {
        setTimeout(() => speak(queued, { pitch: 1.3, rate: 0.95 }), 250);
      }
    };

    try {
      rec.start();
      recRef.current = rec;
    } catch {
      // Some browsers throw if start() is called too rapidly
      setListening(false);
    }
  }, [handleResult, cancelAutoClear, showErrorCard]);

  const toggleMic = useCallback(() => {
    if (listening) {
      // STOP pressed — finish the session and fully refresh for a new command.
      stopRequestedRef.current = true;
      if (recRef.current) {
        try {
          // stop() politely finalises any speech already heard (so nothing
          // the kid said is lost); the UI below resets immediately.
          recRef.current.stop();
        } catch {
          /* ignore */
        }
        recRef.current = null;
      }
      pendingSpeechRef.current = null;
      resetForNewCommand();
      setListening(false);
    } else {
      // START pressed — clear any previous result, then listen.
      resetForNewCommand();
      startListening();
    }
  }, [listening, startListening, resetForNewCommand]);

  // Quick-example buttons (mouse/keyboard fallback)
  const tryExample = useCallback(
    (phrase: string) => {
      // If a voice session is somehow still open, close it quietly first.
      if (listening && recRef.current) {
        stopRequestedRef.current = true;
        try {
          recRef.current.abort();
        } catch {
          /* ignore */
        }
        recRef.current = null;
        setListening(false);
      }
      pendingSpeechRef.current = null;
      const parsed = parseSpokenMath(phrase);
      handleResult(parsed, phrase, false);
    },
    [listening, handleResult]
  );

  const resetProgress = useCallback(() => {
    setStreak(0);
    setDisplay(null);
    setMood('idle');
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
        window.dispatchEvent(new Event('kiyan-state-updated'));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return next;
    });
  }, []);

  const micDisabled = supported === false;
  const currentHint = EXAMPLE_PHRASES[hintIndex];

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-amber-200 via-orange-200 to-pink-200">
      {/* Decorative floating shapes */}
      <FloatingDecorations />

      <Confetti run={confettiRun} />

      {/* Level-up banner */}
      <AnimatePresence>
        {showLevelUp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6, y: -40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: -40 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-40 bg-gradient-to-r from-orange-500 to-pink-500 text-white px-6 py-3 rounded-full text-xl md:text-2xl font-black shadow-2xl border-4 border-white"
          >
            {showLevelUp}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative z-10 flex min-h-screen flex-col">
        {/* Header */}
        <header className="px-4 pt-6 pb-2 md:pt-8 md:px-8">
          <div className="mx-auto max-w-5xl flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-none drop-shadow-sm">
                <RainbowText text="KIYAN" />
              </h1>
              <p className="text-base md:text-xl font-bold text-purple-700 mt-1">
                Voice Math Adventure
              </p>
            </div>

            <ScorePanel
              score={score}
              streak={streak}
              bestStreak={bestStreak}
              solved={solved}
              onReset={resetProgress}
              muted={muted}
              onToggleMute={toggleMute}
              onHelp={() => setShowHelp(true)}
            />
          </div>
        </header>

        {/* Main content */}
        <section className="flex-1 px-4 md:px-8 pb-6 flex flex-col items-center gap-6 md:gap-8">
          {/* Mascot */}
          <div className="mt-2 md:mt-4">
            <Mascot mood={mood} />
          </div>

          {/* Result display */}
          <ResultCard display={display} interim={interim} listening={listening} />

          {/* Microphone button */}
          <MicButton
            listening={listening}
            disabled={micDisabled}
            onClick={toggleMic}
          />

          {/* Hint */}
          {!display && (
            <motion.div
              key={currentHint.text}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center text-sm md:text-base font-bold text-purple-700/90 bg-white/70 backdrop-blur px-4 py-2 rounded-full border-2 border-purple-200"
            >
              Try saying: <span className="text-pink-600">“{currentHint.text}”</span>
            </motion.div>
          )}

          {/* Example chips */}
          <div className="w-full max-w-2xl">
            <p className="text-center text-xs md:text-sm font-bold uppercase tracking-wider text-purple-600/80 mb-3">
              Or tap a quick example
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
              {EXAMPLE_PHRASES.map((ex) => (
                <button
                  key={ex.text}
                  onClick={() => tryExample(ex.text)}
                  className="group rounded-2xl bg-white/80 backdrop-blur border-2 border-white hover:border-pink-300 hover:bg-white transition-all px-3 py-3 md:py-4 font-black text-lg md:text-2xl text-purple-700 shadow-sm hover:shadow-md active:scale-95"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-auto px-4 md:px-8 pb-4 pt-2 text-center">
          <p className="text-xs md:text-sm font-semibold text-purple-700/70">
            Made with love for Kiyan · Speak clearly and have fun!
          </p>
        </footer>
      </main>

      {/* Unsupported browser banner */}
      {micDisabled && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur px-4 py-2 rounded-full text-sm font-bold text-orange-600 border-2 border-orange-300 shadow-lg">
          Voice input isn’t available here — use the example buttons below!
        </div>
      )}

      {/* Help modal */}
      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

/* ---------- Sub-components ---------- */

function ScorePanel({
  score,
  streak,
  bestStreak,
  solved,
  onReset,
  muted,
  onToggleMute,
  onHelp,
}: {
  score: number;
  streak: number;
  bestStreak: number;
  solved: number;
  onReset: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-end">
      <Stat icon={<Star className="text-yellow-500" size={18} fill="currentColor" />} label="Points" value={score} color="bg-yellow-100 border-yellow-300 text-yellow-700" />
      <Stat icon={<Flame className="text-orange-500" size={18} fill="currentColor" />} label="Streak" value={streak} color="bg-orange-100 border-orange-300 text-orange-700" />
      <Stat icon={<Trophy className="text-purple-500" size={18} fill="currentColor" />} label="Best" value={bestStreak} color="bg-purple-100 border-purple-300 text-purple-700" />
      <Stat icon={<Sparkles className="text-pink-500" size={18} fill="currentColor" />} label="Solved" value={solved} color="bg-pink-100 border-pink-300 text-pink-700" />
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleMute}
          aria-label={muted ? 'Turn sound on' : 'Mute sound'}
          className="bg-white/80 border-2 border-purple-200 hover:bg-white hover:border-purple-300 rounded-xl"
        >
          {muted ? <VolumeX className="text-purple-500" /> : <Volume2 className="text-purple-500" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onHelp}
          aria-label="How to play"
          className="bg-white/80 border-2 border-purple-200 hover:bg-white hover:border-purple-300 rounded-xl"
        >
          <HelpCircle className="text-purple-500" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onReset}
          aria-label="Reset progress"
          className="bg-white/80 border-2 border-purple-200 hover:bg-white hover:border-purple-300 rounded-xl"
        >
          <RotateCcw className="text-purple-500" />
        </Button>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border-2 font-black ${color}`} title={label}>
      {icon}
      <span className="text-base md:text-lg tabular-nums">{value}</span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

function ResultCard({
  display,
  interim,
  listening,
}: {
  display: DisplayState | null;
  interim: string;
  listening: boolean;
}) {
  return (
    <div className="w-full max-w-2xl min-h-[200px] flex items-center justify-center">
      <AnimatePresence mode="wait">
        {!display && !listening && !interim && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full rounded-3xl bg-white/70 backdrop-blur border-4 border-dashed border-purple-300 p-8 text-center"
          >
            <p className="text-xl md:text-2xl font-black text-purple-700">
              Tap the microphone
            </p>
            <p className="text-base md:text-lg font-bold text-purple-500 mt-2">
              Say a math problem like “five plus three”
            </p>
          </motion.div>
        )}

        {(listening || interim) && !display && (
          <motion.div
            key="listening"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full rounded-3xl bg-white/80 backdrop-blur border-4 border-orange-300 p-8 text-center shadow-lg"
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
              className="text-4xl md:text-5xl mb-3"
              aria-hidden
            >
              👂
            </motion.div>
            <p className="text-xl md:text-2xl font-black text-orange-600">
              Listening…
            </p>
            {interim && (
              <p className="text-base md:text-lg font-bold text-purple-600 mt-2 italic">
                “{interim}”
              </p>
            )}
          </motion.div>
        )}

        {display && (
          <motion.div
            key={display.expression + display.result + display.message}
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: -20 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className={`w-full rounded-3xl p-6 md:p-8 text-center shadow-xl border-4 ${
              display.result !== null
                ? 'bg-white/95 border-green-300'
                : 'bg-white/95 border-orange-300'
            }`}
          >
            {display.transcript && (
              <p className="text-xs md:text-sm font-bold uppercase tracking-wider text-purple-500/80 mb-2">
                You said
              </p>
            )}
            {display.transcript && (
              <p className="text-base md:text-lg font-bold text-purple-700 italic mb-3">
                “{display.transcript}”
              </p>
            )}

            {display.result !== null ? (
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 14 }}
                className="flex flex-col items-center gap-2"
              >
                <div className="text-4xl md:text-6xl font-black tracking-tight flex flex-wrap items-center justify-center gap-2">
                  <EquationText expression={display.expression} result={display.result} />
                </div>
                <p className="text-2xl md:text-3xl font-black text-green-600 mt-2">
                  {display.message}
                </p>
              </motion.div>
            ) : (
              <p className="text-xl md:text-3xl font-black text-orange-600">
                {display.message}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EquationText({ expression, result }: { expression: string; result: number }) {
  // Split expression into tokens so we can color each number/operator.
  const tokens = useMemo(() => {
    return expression
      .split(/(\s+|×|÷|−|\+|=|\d+(?:\.\d+)?)/g)
      .filter((t) => t.trim() !== '');
  }, [expression]);

  const resultStr = Number.isInteger(result) ? String(result) : result.toFixed(2);

  return (
    <>
      {tokens.map((t, i) => {
        const isOp = ['+', '−', '×', '÷', '='].includes(t);
        return (
          <span
            key={i}
            className={
              isOp
                ? 'text-purple-500 px-1'
                : RAINBOW_COLORS[i % RAINBOW_COLORS.length]
            }
          >
            {t}
          </span>
        );
      })}
      <span className="text-purple-500 px-1">=</span>
      <motion.span
        initial={{ scale: 1.4 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 10 }}
        className="text-green-600 px-2 underline decoration-wavy decoration-green-400"
      >
        {resultStr}
      </motion.span>
    </>
  );
}

function MicButton({
  listening,
  disabled,
  onClick,
}: {
  listening: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="relative flex flex-col items-center gap-2">
      <motion.div
        animate={
          listening
            ? { scale: [1, 1.15, 1] }
            : { scale: 1 }
        }
        transition={{ duration: 0.8, repeat: listening ? Infinity : 0, ease: 'easeInOut' }}
        className="absolute -inset-3 rounded-full bg-gradient-to-r from-orange-400 to-pink-400 blur-xl opacity-60"
      />
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.05 }}
        aria-label={listening ? 'Stop listening' : 'Tap to speak'}
        className={`relative flex items-center justify-center w-24 h-24 md:w-32 md:h-32 rounded-full text-white shadow-2xl border-4 border-white transition-colors ${
          listening
            ? 'bg-gradient-to-br from-red-500 to-orange-500'
            : 'bg-gradient-to-br from-orange-500 to-pink-500'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {listening ? (
          <MicOff className="w-10 h-10 md:w-14 md:h-14" />
        ) : (
          <Mic className="w-10 h-10 md:w-14 md:h-14" />
        )}
      </motion.button>
      <p className="text-sm md:text-base font-black text-purple-700">
        {listening ? 'Tap to stop' : 'Tap to speak'}
      </p>
    </div>
  );
}

function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-md w-full p-6 md:p-8 shadow-2xl border-4 border-purple-200 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl md:text-3xl font-black text-purple-700">
                How to Play 🚀
              </h2>
              <button
                onClick={onClose}
                aria-label="Close help"
                className="p-1 rounded-full hover:bg-purple-100"
              >
                <X className="text-purple-500" />
              </button>
            </div>

            <div className="space-y-4 text-purple-900">
              <div>
                <h3 className="text-lg font-black text-pink-600 mb-1">1. Tap the mic</h3>
                <p className="font-semibold">
                  Press the big round microphone button. When it turns red, Kiyan is listening!
                </p>
              </div>

              <div>
                <h3 className="text-lg font-black text-orange-600 mb-1">2. Say a math problem</h3>
                <p className="font-semibold mb-2">Examples:</p>
                <ul className="font-semibold space-y-1 text-sm">
                  <li>• “five plus three”</li>
                  <li>• “ten minus four”</li>
                  <li>• “six times seven”</li>
                  <li>• “twenty divided by four”</li>
                  <li>• “one hundred plus fifty”</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-black text-green-600 mb-1">3. Hear the answer!</h3>
                <p className="font-semibold">
                  The robot reads the answer out loud and throws a confetti party. 🎉 Then it
                  gets ready for your next question automatically!
                </p>
              </div>

              <div>
                <h3 className="text-lg font-black text-purple-600 mb-1">4. Build a streak!</h3>
                <p className="font-semibold">
                  Solve several in a row to grow your streak and earn bonus points. Hit a streak of 5 for a surprise!
                </p>
              </div>

              <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-3">
                <p className="font-bold text-amber-700 text-sm">
                  💡 Tips: Speak clearly and not too fast. Tap the mic again while listening to
                  stop and start fresh. If the mic is blocked, use the example buttons instead!
                </p>
              </div>
            </div>

            <Button
              onClick={onClose}
              className="w-full mt-6 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white font-black text-lg h-12 rounded-2xl"
            >
              Let&apos;s play!
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Deterministic PRNG (mulberry32) so the floating decorations are computed
// identically on the server and the client — no hydration mismatch, and
// no need to setState-after-mount.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FLOATING_DECORATIONS = (() => {
  const shapes = ['+', '−', '×', '÷', '★', '1', '2', '3', '5', '7', '8'];
  const rand = mulberry32(42);
  return Array.from({ length: 14 }).map((_, i) => ({
    id: i,
    left: rand() * 100,
    top: rand() * 100,
    size: 24 + rand() * 36,
    delay: rand() * 4,
    duration: 4 + rand() * 4,
    shape: shapes[i % shapes.length],
    color: RAINBOW_COLORS[i % RAINBOW_COLORS.length],
  }));
})();

function FloatingDecorations() {
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      {FLOATING_DECORATIONS.map((it) => (
        <motion.span
          key={it.id}
          className={`absolute font-black opacity-30 ${it.color}`}
          style={{ left: `${it.left}%`, top: `${it.top}%`, fontSize: it.size }}
          animate={{
            y: [0, -20, 0],
            rotate: [0, 15, -15, 0],
          }}
          transition={{
            duration: it.duration,
            delay: it.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {it.shape}
        </motion.span>
      ))}
    </div>
  );
}

/* ---------- Helpers ---------- */

function spokenResultText(parsed: ParseResult): string {
  if (parsed.result === null) return '';
  const r = parsed.result;
  const rStr = Number.isInteger(r) ? numberToWords(r) : r.toFixed(2);
  return `${parsed.expression.replace(/×/g, 'times').replace(/÷/g, 'divided by').replace(/−/g, 'minus')} equals ${rStr}.`;
}

const NUM_WORDS_UNDER_100: string[] = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS: string[] = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
];

function numberToWords(n: number): string {
  if (n < 0) return 'negative ' + numberToWords(-n);
  if (n < 20) return NUM_WORDS_UNDER_100[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const r = n % 10;
    return r === 0 ? TENS[t] : `${TENS[t]} ${NUM_WORDS_UNDER_100[r]}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return r === 0 ? `${NUM_WORDS_UNDER_100[h]} hundred` : `${NUM_WORDS_UNDER_100[h]} hundred ${numberToWords(r)}`;
  }
  if (n < 1_000_000) {
    const th = Math.floor(n / 1000);
    const r = n % 1000;
    return r === 0 ? `${numberToWords(th)} thousand` : `${numberToWords(th)} thousand ${numberToWords(r)}`;
  }
  return String(n);
}
