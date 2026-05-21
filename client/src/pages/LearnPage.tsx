import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  BookOpen, Activity, BookMarked, ListOrdered, Calculator, LineChart,
  ShieldCheck, Target, Brain, Layers, Lock, CheckCircle2, ChevronLeft,
  ChevronRight, GraduationCap, Lightbulb, AlertTriangle, Sparkles, RotateCcw, Trophy,
} from 'lucide-react';
import { cn } from '../lib/utils';
import notify from '../lib/notify';
import { MODULES, PASS_PCT, type Module, type Block } from '../lib/learnContent';

const ICONS: Record<string, any> = {
  BookOpen, Activity, BookMarked, ListOrdered, Calculator, LineChart,
  ShieldCheck, Target, Brain, Layers,
};
const LEVEL_STYLE: Record<string, string> = {
  Beginner:     'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  Intermediate: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  Advanced:     'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
};

interface ProgressRow { module_id: string; completed: number; score: number; total: number }
type View = 'list' | 'lessons' | 'quiz' | 'result';

export default function LearnPage() {
  const [progress, setProgress] = useState<Record<string, ProgressRow>>({});
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');

  // lesson stepper
  const [lessonIdx, setLessonIdx] = useState(0);
  // quiz state
  const [qIdx, setQIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [score, setScore] = useState(0);

  const active = useMemo<Module | null>(() => MODULES.find((m) => m.id === activeId) || null, [activeId]);

  useEffect(() => {
    axios.get('/api/learn/progress')
      .then((r) => {
        const map: Record<string, ProgressRow> = {};
        for (const row of (r.data?.progress || [])) map[row.module_id] = row;
        setProgress(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const completedCount = Object.values(progress).filter((p) => p.completed).length;
  const isUnlocked = (idx: number) => idx === 0 || !!progress[MODULES[idx - 1].id]?.completed;

  function openModule(idx: number) {
    if (!isUnlocked(idx)) { notify.info('Complete the previous module to unlock this one'); return; }
    setActiveId(MODULES[idx].id);
    setLessonIdx(0);
    setView('lessons');
  }

  function startQuiz() {
    setQIdx(0); setPicked(null); setAnswers([]); setScore(0);
    setView('quiz');
  }

  function submitAnswer() {
    if (picked === null || !active) return;
    const correct = active.quiz[qIdx].answer === picked;
    setAnswers((a) => [...a, picked]);
    if (correct) setScore((s) => s + 1);
  }

  async function nextQuestion() {
    if (!active) return;
    if (qIdx < active.quiz.length - 1) {
      setQIdx((i) => i + 1);
      setPicked(null);
    } else {
      // finished — compute & persist
      const total = active.quiz.length;
      const finalScore = score; // already includes current via submitAnswer
      const passed = finalScore / total >= PASS_PCT;
      setView('result');
      if (passed) {
        try {
          await axios.post('/api/learn/complete', { moduleId: active.id, score: finalScore, total });
          setProgress((p) => ({ ...p, [active.id]: { module_id: active.id, completed: 1, score: finalScore, total } }));
        } catch (err) { notify.fromError(err); }
      }
    }
  }

  // ── List view ──
  if (view === 'list') {
    return (
      <div className="p-4 lg:p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="w-7 h-7 text-groww-primary" />
            Trading Academy
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Master equity, trading terms, analysis, risk, strategy &amp; psychology — one module at a time.
          </p>
        </div>

        {/* Overall progress */}
        <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" /> Your progress
            </span>
            <span className="text-sm font-bold text-groww-primary">{completedCount} / {MODULES.length} completed</span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-groww-primary rounded-full transition-all"
              style={{ width: `${(completedCount / MODULES.length) * 100}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MODULES.map((m, idx) => {
            const Icon = ICONS[m.icon] || BookOpen;
            const done = !!progress[m.id]?.completed;
            const unlocked = isUnlocked(idx);
            return (
              <button
                key={m.id}
                onClick={() => openModule(idx)}
                disabled={!unlocked}
                className={cn(
                  'text-left bg-white dark:bg-groww-card rounded-xl border p-4 transition relative',
                  unlocked
                    ? 'border-gray-100 dark:border-gray-800 hover:border-groww-primary/60 hover:shadow-sm cursor-pointer'
                    : 'border-gray-100 dark:border-gray-800 opacity-60 cursor-not-allowed'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                    done ? 'bg-green-100 dark:bg-green-900/30 text-groww-primary' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400')}>
                    {done ? <CheckCircle2 className="w-5 h-5" /> : unlocked ? <Icon className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] text-gray-400 font-bold">{String(idx + 1).padStart(2, '0')}</span>
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', LEVEL_STYLE[m.level])}>{m.level}</span>
                    </div>
                    <p className="font-semibold text-sm">{m.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{m.summary}</p>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                      <span>{m.lessons.length} lessons</span>
                      <span>{m.quiz.length} questions</span>
                      <span>~{m.minutes} min</span>
                      {done && <span className="text-groww-primary font-semibold">✓ {progress[m.id].score}/{progress[m.id].total}</span>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {loading && <p className="text-center text-xs text-gray-400 mt-4">Syncing progress…</p>}
      </div>
    );
  }

  if (!active) { setView('list'); return null; }
  const Icon = ICONS[active.icon] || BookOpen;

  // ── Lessons view ──
  if (view === 'lessons') {
    const lesson = active.lessons[lessonIdx];
    const isLast = lessonIdx === active.lessons.length - 1;
    return (
      <div className="p-4 lg:p-6 max-w-3xl mx-auto">
        <button onClick={() => setView('list')} className="text-xs text-gray-500 hover:text-groww-primary flex items-center gap-1 mb-4">
          <ChevronLeft className="w-3.5 h-3.5" /> Back to academy
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-5 h-5 text-groww-primary" />
          <h1 className="text-xl font-bold">{active.title}</h1>
        </div>
        {/* lesson progress dots */}
        <div className="flex gap-1.5 mb-5 mt-3">
          {active.lessons.map((_, i) => (
            <span key={i} className={cn('h-1.5 rounded-full flex-1 transition-all',
              i <= lessonIdx ? 'bg-groww-primary' : 'bg-gray-200 dark:bg-gray-700')} />
          ))}
        </div>

        <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
          <p className="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-2">
            Lesson {lessonIdx + 1} of {active.lessons.length}
          </p>
          <h2 className="text-lg font-bold mb-4">{lesson.title}</h2>
          <div className="space-y-3">
            {lesson.blocks.map((b, i) => <BlockView key={i} block={b} />)}
          </div>
        </div>

        <div className="flex items-center justify-between mt-5">
          <button
            onClick={() => lessonIdx > 0 ? setLessonIdx(lessonIdx - 1) : setView('list')}
            className="flex items-center gap-1 text-sm font-semibold px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="w-4 h-4" /> {lessonIdx > 0 ? 'Previous' : 'Exit'}
          </button>
          {isLast ? (
            <button onClick={startQuiz} className="flex items-center gap-2 text-sm font-bold px-5 py-2 rounded-lg bg-groww-primary text-white hover:bg-green-600">
              Take the quiz <Sparkles className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={() => setLessonIdx(lessonIdx + 1)} className="flex items-center gap-1 text-sm font-bold px-5 py-2 rounded-lg bg-groww-primary text-white hover:bg-green-600">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Quiz view ──
  if (view === 'quiz') {
    const question = active.quiz[qIdx];
    const answered = answers.length > qIdx;
    return (
      <div className="p-4 lg:p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold text-gray-400">{active.title} · Quiz</span>
          <span className="text-xs font-bold text-groww-primary">Question {qIdx + 1} / {active.quiz.length}</span>
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-5">
          <div className="h-full bg-groww-primary transition-all" style={{ width: `${(qIdx / active.quiz.length) * 100}%` }} />
        </div>

        <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
          <h2 className="text-base font-bold mb-4">{question.q}</h2>
          <div className="space-y-2">
            {question.options.map((opt, i) => {
              const isPicked = picked === i;
              const isCorrect = question.answer === i;
              let cls = 'border-gray-200 dark:border-gray-700 hover:border-groww-primary/60';
              if (answered) {
                if (isCorrect) cls = 'border-green-500 bg-green-50 dark:bg-green-900/20';
                else if (isPicked) cls = 'border-red-500 bg-red-50 dark:bg-red-900/20';
                else cls = 'border-gray-200 dark:border-gray-700 opacity-60';
              } else if (isPicked) {
                cls = 'border-groww-primary bg-green-50/50 dark:bg-green-900/10';
              }
              return (
                <button
                  key={i}
                  disabled={answered}
                  onClick={() => setPicked(i)}
                  className={cn('w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition flex items-center gap-3', cls)}
                >
                  <span className={cn('w-6 h-6 rounded-full border flex items-center justify-center text-xs shrink-0',
                    answered && isCorrect ? 'border-green-500 text-green-600' :
                    answered && isPicked ? 'border-red-500 text-red-600' : 'border-gray-300 dark:border-gray-600')}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>

          {answered && (
            <div className={cn('mt-4 p-3 rounded-xl text-sm',
              picked === question.answer
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300')}>
              <p className="font-bold mb-0.5">{picked === question.answer ? 'Correct! ✓' : 'Not quite.'}</p>
              <p className="text-[13px] leading-relaxed">{question.explain}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-5">
          {!answered ? (
            <button onClick={submitAnswer} disabled={picked === null}
              className="text-sm font-bold px-6 py-2.5 rounded-lg bg-groww-primary text-white hover:bg-green-600 disabled:opacity-40">
              Check answer
            </button>
          ) : (
            <button onClick={nextQuestion}
              className="flex items-center gap-1 text-sm font-bold px-6 py-2.5 rounded-lg bg-groww-primary text-white hover:bg-green-600">
              {qIdx < active.quiz.length - 1 ? 'Next question' : 'See result'} <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Result view ──
  const total = active.quiz.length;
  const pct = Math.round((score / total) * 100);
  const passed = score / total >= PASS_PCT;
  const nextIdx = MODULES.findIndex((m) => m.id === active.id) + 1;
  const hasNext = nextIdx < MODULES.length;

  return (
    <div className="p-4 lg:p-6 max-w-lg mx-auto">
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-8 text-center">
        <div className={cn('w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4',
          passed ? 'bg-green-100 dark:bg-green-900/30 text-groww-primary' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600')}>
          {passed ? <Trophy className="w-8 h-8" /> : <RotateCcw className="w-8 h-8" />}
        </div>
        <h1 className="text-2xl font-bold">{passed ? 'Module complete! 🎉' : 'Almost there!'}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          You scored <span className="font-bold text-gray-900 dark:text-white">{score} / {total}</span> ({pct}%)
        </p>
        <p className="text-xs text-gray-400 mt-2">
          {passed
            ? `You’ve mastered "${active.title}".`
            : `You need ${Math.ceil(total * PASS_PCT)}/${total} to pass. Review the lessons and try again.`}
        </p>

        <div className="flex flex-col gap-2 mt-6">
          {passed && hasNext && (
            <button onClick={() => openModule(nextIdx)}
              className="w-full py-2.5 rounded-lg bg-groww-primary text-white font-bold hover:bg-green-600 flex items-center justify-center gap-2">
              Next: {MODULES[nextIdx].title} <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {!passed && (
            <button onClick={() => { setView('lessons'); setLessonIdx(0); }}
              className="w-full py-2.5 rounded-lg bg-groww-primary text-white font-bold hover:bg-green-600">
              Review lessons
            </button>
          )}
          <button onClick={startQuiz}
            className="w-full py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
            Retake quiz
          </button>
          <button onClick={() => setView('list')}
            className="w-full py-2 text-sm text-gray-500 hover:text-groww-primary font-medium">
            Back to academy
          </button>
        </div>
      </div>
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'p':
      return <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{block.text}</p>;
    case 'list':
      return (
        <ul className="space-y-1.5 pl-1">
          {block.items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="w-1.5 h-1.5 rounded-full bg-groww-primary mt-1.5 shrink-0" />
              {it}
            </li>
          ))}
        </ul>
      );
    case 'term':
      return (
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 px-4 py-3">
          <p className="text-sm font-bold text-gray-900 dark:text-white">{block.term}</p>
          <p className="text-[13px] text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">{block.def}</p>
        </div>
      );
    case 'tip':
      return (
        <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 px-4 py-3">
          <Lightbulb className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-[13px] text-blue-700 dark:text-blue-300 leading-relaxed">{block.text}</p>
        </div>
      );
    case 'warn':
      return (
        <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[13px] text-amber-700 dark:text-amber-300 leading-relaxed">{block.text}</p>
        </div>
      );
  }
}
