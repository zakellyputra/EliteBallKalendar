import { useState } from 'react';
import { Navigation } from '../components/Navigation';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ChevronLeft, ChevronRight, Download, Share2, Trophy, TrendingUp, Clock, Calendar, Zap, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

interface MonthlyStats {
  month: string;
  totalHours: number;
  blocksCompleted: number;
  blocksSkipped: number;
  reschedulesNeeded: number;
  topSubjects: { name: string; hours: number; color: string }[];
  peakProductivityDay: string;
  peakProductivityHour: string;
  weekendHoursLost: number;
  achievements: string[];
}

const MOCK_STATS: MonthlyStats = {
  month: 'January 2026',
  totalHours: 142,
  blocksCompleted: 284,
  blocksSkipped: 23,
  reschedulesNeeded: 47,
  topSubjects: [
    { name: 'CS251', hours: 48, color: '#a855f7' },
    { name: 'Math 220', hours: 38, color: '#3b82f6' },
    { name: 'Project X', hours: 32, color: '#ec4899' },
    { name: 'Physics', hours: 24, color: '#10b981' },
  ],
  peakProductivityDay: 'Wednesday',
  peakProductivityHour: '10:00 AM',
  weekendHoursLost: 8,
  achievements: [
    'Completed 95% of scheduled blocks',
    'Maintained 142-hour focus streak',
    'Zero missed deadlines',
    'Most productive January on record',
  ],
};

const WEEKLY_DATA = [
  { week: 'Week 1', hours: 32 },
  { week: 'Week 2', hours: 38 },
  { week: 'Week 3', hours: 35 },
  { week: 'Week 4', hours: 37 },
];

const STORY_SLIDES = [
  {
    id: 1,
    type: 'intro',
    title: 'Your January Recap',
    subtitle: 'Elite Ball Kalendar',
  },
  {
    id: 2,
    type: 'total-hours',
    title: '142 Hours',
    subtitle: 'of focused work this month',
    metric: 142,
    icon: Clock,
  },
  {
    id: 3,
    type: 'blocks',
    title: '284 Work Blocks',
    subtitle: 'completed with dedication',
    metric: 284,
    icon: Target,
  },
  {
    id: 4,
    type: 'subjects',
    title: 'Top Focus Areas',
    subtitle: 'Where you spent your time',
  },
  {
    id: 5,
    type: 'productivity',
    title: 'Peak Performance',
    subtitle: 'Your most productive moments',
  },
  {
    id: 6,
    type: 'reschedules',
    title: '47 Reschedules',
    subtitle: 'AI helped you adapt on the fly',
    metric: 47,
    icon: Zap,
  },
  {
    id: 7,
    type: 'achievements',
    title: 'Achievements Unlocked',
    subtitle: 'January milestones',
  },
  {
    id: 8,
    type: 'forward',
    title: 'Ready for February?',
    subtitle: "Let's make it even better",
  },
];

export function Statistics() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [viewMode, setViewMode] = useState<'story' | 'summary'>('story');

  const nextSlide = () => {
    if (currentSlide < STORY_SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') nextSlide();
    if (e.key === 'ArrowLeft') prevSlide();
  };

  const renderStorySlide = (slide: typeof STORY_SLIDES[0]) => {
    switch (slide.type) {
      case 'intro':
        return (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-500"
            >
              <span className="text-4xl font-bold text-white">EBK</span>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mb-4 text-6xl font-bold"
            >
              {slide.title}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-2xl text-muted-foreground"
            >
              {slide.subtitle}
            </motion.p>
          </div>
        );

      case 'total-hours':
      case 'blocks':
      case 'reschedules':
        const Icon = slide.icon!;
        return (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="mb-8"
            >
              <Icon className="h-24 w-24 text-purple-500" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, type: 'spring' }}
              className="mb-4 bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-8xl font-bold text-transparent"
            >
              {slide.metric}
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mb-2 text-4xl font-bold"
            >
              {slide.title.split(' ').slice(1).join(' ')}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-xl text-muted-foreground"
            >
              {slide.subtitle}
            </motion.p>
          </div>
        );

      case 'subjects':
        return (
          <div className="flex h-full flex-col items-center justify-center text-center px-8">
            <motion.h2
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 text-5xl font-bold"
            >
              {slide.title}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-12 text-xl text-muted-foreground"
            >
              {slide.subtitle}
            </motion.p>
            <div className="w-full max-w-2xl space-y-4">
              {MOCK_STATS.topSubjects.map((subject, idx) => (
                <motion.div
                  key={subject.name}
                  initial={{ opacity: 0, x: -50 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + idx * 0.1 }}
                  className="relative"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl font-semibold">{subject.name}</span>
                    <span className="text-2xl font-bold" style={{ color: subject.color }}>
                      {subject.hours}h
                    </span>
                  </div>
                  <div className="h-4 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(subject.hours / MOCK_STATS.totalHours) * 100}%` }}
                      transition={{ delay: 0.6 + idx * 0.1, duration: 0.8 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: subject.color }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        );

      case 'productivity':
        return (
          <div className="flex h-full flex-col items-center justify-center text-center px-8">
            <motion.h2
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 text-5xl font-bold"
            >
              {slide.title}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-12 text-xl text-muted-foreground"
            >
              {slide.subtitle}
            </motion.p>
            <div className="grid gap-8 md:grid-cols-2">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
                className="rounded-2xl border-2 border-purple-500 bg-purple-500/10 p-8"
              >
                <Calendar className="mx-auto mb-4 h-12 w-12 text-purple-500" />
                <p className="mb-2 text-sm text-muted-foreground">Best Day</p>
                <p className="text-3xl font-bold">{MOCK_STATS.peakProductivityDay}</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 }}
                className="rounded-2xl border-2 border-blue-500 bg-blue-500/10 p-8"
              >
                <Clock className="mx-auto mb-4 h-12 w-12 text-blue-500" />
                <p className="mb-2 text-sm text-muted-foreground">Peak Hour</p>
                <p className="text-3xl font-bold">{MOCK_STATS.peakProductivityHour}</p>
              </motion.div>
            </div>
          </div>
        );

      case 'achievements':
        return (
          <div className="flex h-full flex-col items-center justify-center text-center px-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring' }}
              className="mb-8"
            >
              <Trophy className="h-24 w-24 text-yellow-500" />
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-4 text-5xl font-bold"
            >
              {slide.title}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mb-12 text-xl text-muted-foreground"
            >
              {slide.subtitle}
            </motion.p>
            <div className="space-y-4 max-w-2xl">
              {MOCK_STATS.achievements.map((achievement, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -50 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + idx * 0.1 }}
                  className="flex items-center gap-4 rounded-xl border-2 border-border bg-card p-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-500">
                    <Trophy className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-left text-lg font-medium">{achievement}</p>
                </motion.div>
              ))}
            </div>
          </div>
        );

      case 'forward':
        return (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring' }}
              className="mb-8"
            >
              <TrendingUp className="h-24 w-24 text-green-500" />
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-4 text-5xl font-bold"
            >
              {slide.title}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mb-8 text-xl text-muted-foreground"
            >
              {slide.subtitle}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <Button
                size="lg"
                className="bg-gradient-to-r from-purple-500 to-blue-500 text-lg"
                onClick={() => setViewMode('summary')}
              >
                View Full Summary
              </Button>
            </motion.div>
          </div>
        );

      default:
        return null;
    }
  };

  if (viewMode === 'summary') {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-4 pt-24 pb-12">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1>January 2026 Statistics</h1>
              <p className="text-muted-foreground">Your complete productivity overview</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setViewMode('story')}>
                View Story
              </Button>
              <Button variant="outline">
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>

          {/* Overview Cards */}
          <div className="mb-8 grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Hours</p>
                    <p className="text-3xl font-bold">{MOCK_STATS.totalHours}</p>
                  </div>
                  <Clock className="h-10 w-10 text-purple-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Blocks Done</p>
                    <p className="text-3xl font-bold">{MOCK_STATS.blocksCompleted}</p>
                  </div>
                  <Target className="h-10 w-10 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Reschedules</p>
                    <p className="text-3xl font-bold">{MOCK_STATS.reschedulesNeeded}</p>
                  </div>
                  <Zap className="h-10 w-10 text-pink-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Completion</p>
                    <p className="text-3xl font-bold">
                      {Math.round((MOCK_STATS.blocksCompleted / (MOCK_STATS.blocksCompleted + MOCK_STATS.blocksSkipped)) * 100)}%
                    </p>
                  </div>
                  <Trophy className="h-10 w-10 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4">Weekly Progress</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={WEEKLY_DATA}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="week" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="hours" fill="#a855f7" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4">Time by Subject</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={MOCK_STATS.topSubjects}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => entry.name}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="hours"
                    >
                      {MOCK_STATS.topSubjects.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Achievements */}
          <Card className="mt-6">
            <CardContent className="pt-6">
              <h3 className="mb-4">Achievements</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {MOCK_STATS.achievements.map((achievement, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    <p>{achievement}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Story Mode
  return (
    <div
      className="fixed inset-0 bg-gradient-to-br from-purple-900 via-blue-900 to-black text-white"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="h-full"
        >
          {renderStorySlide(STORY_SLIDES[currentSlide])}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="fixed bottom-8 left-0 right-0">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={prevSlide}
              disabled={currentSlide === 0}
              className="text-white hover:bg-white/20"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>

            <div className="flex gap-2">
              {STORY_SLIDES.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx)}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentSlide ? 'w-8 bg-white' : 'w-2 bg-white/40'
                  }`}
                />
              ))}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={nextSlide}
              disabled={currentSlide === STORY_SLIDES.length - 1}
              className="text-white hover:bg-white/20"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </div>

      {/* Exit Button */}
      <Button
        variant="ghost"
        className="fixed top-4 right-4 text-white hover:bg-white/20"
        onClick={() => setViewMode('summary')}
      >
        View Summary
      </Button>
    </div>
  );
}
