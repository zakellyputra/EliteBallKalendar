import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Navigation } from '../components/Navigation';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ChevronLeft, ChevronRight, Download, Share2, Trophy, TrendingUp, Clock, Calendar, Zap, Target, Loader2, Plus, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { useStats } from '../hooks/useStats';
import { useAuthContext } from '../components/AuthProvider';
import marioAi from '../assets/mario/mario-ai-104.png';
import lebronAi from '../assets/lebron/lebron-ai-104.png';
import newjeansAi from '../assets/newjeans/newjeans-ai-104.png';
import matchaCup from '../assets/matcha/matcha-cup-104.png';
import calendarMonk from '../assets/persona/calendar-monk.png';
import deadlineDemon from '../assets/persona/deadline-demon.jpg';
import galaxyBrain from '../assets/persona/galaxy-brain.jpg';
import midnightGoblin from '../assets/persona/midnight-goblin.png';
import sunshine from '../assets/persona/sunshine.gif';

const PERSONA_IMAGES: Record<string, string> = {
  'mario-ai-104.png': marioAi,
  'lebron-ai-104.png': lebronAi,
  'newjeans-ai-104.png': newjeansAi,
  'matcha-cup-104.png': matchaCup,
  'calendar-monk.png': calendarMonk,
  'deadline-demon.jpg': deadlineDemon,
  'galaxy-brain.jpg': galaxyBrain,
  'midnight-goblin.png': midnightGoblin,
  'sunshine.gif': sunshine,
};

const COLORS = ['#a855f7', '#3b82f6', '#ec4899', '#10b981', '#f97316', '#06b6d4'];

export function Statistics() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthContext();
  const { wrapped, loading, error } = useStats();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [viewMode, setViewMode] = useState<'story' | 'summary'>('story');

  // Build story slides from real data
  const storySlides = [
    {
      id: 1,
      type: 'intro',
      title: wrapped?.month ? `Your ${wrapped.month} Recap` : 'Your Recap',
      subtitle: 'Elite Ball Kalendar',
    },
    {
      id: 2,
      type: 'total-hours',
      title: `${wrapped?.totalFocusedHours || 0} Hours`,
      subtitle: 'of focused work this month',
      metric: wrapped?.totalFocusedHours || 0,
      icon: Clock,
    },
    {
      id: 3,
      type: 'weekly-trend',
      title: 'Weekly Trend',
      subtitle: 'Your productivity week by week',
    },
    {
      id: 4,
      type: 'weekday-weekend',
      title: 'Work Balance',
      subtitle: 'Weekday vs weekend distribution',
    },
    {
      id: 5,
      type: 'blocks',
      title: `${wrapped?.blocksCompleted || 0} Focus Blocks`,
      subtitle: 'completed with dedication',
      metric: wrapped?.blocksCompleted || 0,
      icon: Target,
    },
    {
      id: 6,
      type: 'subjects',
      title: 'Top Focus Areas',
      subtitle: 'Where you spent your time',
    },
    {
      id: 7,
      type: 'productivity',
      title: 'Peak Performance',
      subtitle: 'Your most productive moments',
    },
    {
      id: 8,
      type: 'achievements',
      title: 'Achievements Unlocked',
      subtitle: `${wrapped?.month || 'This month'} milestones`,
    },
    {
      id: 9,
      type: 'persona',
      title: wrapped?.persona?.name || 'The Apprentice',
      subtitle: 'Your Productivity Persona',
    },
    {
      id: 10,
      type: 'forward',
      title: 'Keep Going!',
      subtitle: "Let's make next month even better",
    },
  ];

  const nextSlide = () => {
    if (currentSlide < storySlides.length - 1) {
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

  const renderStorySlide = (slide: typeof storySlides[0]) => {
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

      case 'weekly-trend':
        const weeklyData = wrapped?.weeklyHours || [];
        return (
          <div className="flex h-full flex-col items-center justify-center text-center px-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="mb-6"
            >
              <BarChart3 className="h-16 w-16 text-purple-500" />
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-2 text-5xl font-bold"
            >
              {slide.title}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-8 text-xl text-muted-foreground"
            >
              {slide.subtitle}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="w-full max-w-2xl h-64"
            >
              {weeklyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="label" stroke="rgba(255,255,255,0.6)" tick={{ fill: 'rgba(255,255,255,0.8)' }} />
                    <YAxis stroke="rgba(255,255,255,0.6)" tick={{ fill: 'rgba(255,255,255,0.8)' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px' }}
                      labelStyle={{ color: 'white' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="hours"
                      stroke="#a855f7"
                      strokeWidth={3}
                      dot={{ fill: '#a855f7', strokeWidth: 2, r: 6 }}
                      activeDot={{ r: 8, fill: '#a855f7' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground">No weekly data yet</p>
              )}
            </motion.div>
          </div>
        );

      case 'weekday-weekend':
        const split = wrapped?.weekdayWeekendSplit;
        const sentimentColor = split?.sentiment === 'positive' ? 'text-green-500' :
          split?.sentiment === 'neutral' ? 'text-yellow-500' : 'text-red-500';
        const sentimentBg = split?.sentiment === 'positive' ? 'from-green-500' :
          split?.sentiment === 'neutral' ? 'from-yellow-500' : 'from-red-500';
        const sentimentMessage = split?.sentiment === 'positive' ? 'Great work balance!' :
          split?.sentiment === 'neutral' ? 'Balanced schedule' : 'Consider scheduling more during the week';

        return (
          <div className="flex h-full flex-col items-center justify-center text-center px-8">
            <motion.h2
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-2 text-5xl font-bold"
            >
              {slide.title}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-8 text-xl text-muted-foreground"
            >
              {slide.subtitle}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="w-full max-w-md"
            >
              <div className="mb-6 h-8 overflow-hidden rounded-full bg-muted/30">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${split?.weekdayPercent || 0}%` }}
                  transition={{ delay: 0.6, duration: 1 }}
                  className={`h-full bg-gradient-to-r ${sentimentBg} to-blue-500`}
                />
              </div>
              <div className="grid grid-cols-2 gap-8 mb-6">
                <div>
                  <p className="text-4xl font-bold">{split?.weekdayPercent || 0}%</p>
                  <p className="text-lg text-muted-foreground">Weekday</p>
                  <p className="text-sm text-muted-foreground">{split?.weekdayHours || 0}h</p>
                </div>
                <div>
                  <p className="text-4xl font-bold">{split?.weekendPercent || 0}%</p>
                  <p className="text-lg text-muted-foreground">Weekend</p>
                  <p className="text-sm text-muted-foreground">{split?.weekendHours || 0}h</p>
                </div>
              </div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className={`text-xl font-medium ${sentimentColor}`}
              >
                {sentimentMessage}
              </motion.p>
            </motion.div>
          </div>
        );

      case 'persona':
        const personaImage = wrapped?.persona?.image && PERSONA_IMAGES[wrapped.persona.image] 
          ? PERSONA_IMAGES[wrapped.persona.image] 
          : PERSONA_IMAGES['mario-ai-104.png'];

        return (
          <div className="flex h-full flex-col items-center justify-center text-center px-8">
            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 260, damping: 20 }}
              className="mb-8 relative"
            >
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 blur-2xl opacity-50 animate-pulse" />
              <img 
                src={personaImage} 
                alt={wrapped?.persona?.name || 'Persona'} 
                className="relative h-48 w-48 object-contain drop-shadow-2xl"
              />
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mb-2 text-5xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent"
            >
              {slide.title}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mb-8 text-xl text-muted-foreground"
            >
              {slide.subtitle}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="max-w-xl mx-auto p-6 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20"
            >
              <p className="text-xl leading-relaxed">
                {wrapped?.persona?.description || 'Start working to discover your persona!'}
              </p>
            </motion.div>
          </div>
        );

      case 'subjects':
        const goalData = wrapped?.goalBreakdown || [];
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
              {goalData.length === 0 ? (
                <p className="text-muted-foreground">No focus data yet. Schedule some blocks!</p>
              ) : (
                goalData.slice(0, 4).map((goal, idx) => (
                  <motion.div
                    key={goal.goalId}
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + idx * 0.1 }}
                    className="relative"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl font-semibold">{goal.name}</span>
                      <span className="text-2xl font-bold" style={{ color: COLORS[idx % COLORS.length] }}>
                        {goal.hours}h
                      </span>
                    </div>
                    <div className="h-4 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min((goal.hours / (wrapped?.totalFocusedHours || 1)) * 100, 100)}%` }}
                        transition={{ delay: 0.6 + idx * 0.1, duration: 0.8 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                    </div>
                  </motion.div>
                ))
              )}
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
                <p className="text-3xl font-bold">{wrapped?.peakProductivityDay || 'N/A'}</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 }}
                className="rounded-2xl border-2 border-blue-500 bg-blue-500/10 p-8"
              >
                <Clock className="mx-auto mb-4 h-12 w-12 text-blue-500" />
                <p className="mb-2 text-sm text-muted-foreground">Peak Hour</p>
                <p className="text-3xl font-bold">{wrapped?.peakProductivityHour || 'N/A'}</p>
              </motion.div>
            </div>
          </div>
        );

      case 'achievements':
        const achievements = wrapped?.achievements || ['Start scheduling focus blocks!'];
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
              {achievements.map((achievement, idx) => (
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (viewMode === 'summary') {
    const goalData = wrapped?.goalBreakdown || [];
    
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-4 pt-24 pb-12">
          <div className="mb-6">
            <Button
              variant="ghost"
              className="-ml-2"
              onClick={() => navigate('/')}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </div>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1>{wrapped?.month || 'This Month'} Statistics</h1>
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

          {!isAuthenticated && (
            <Card className="mb-6 border-yellow-500/50 bg-yellow-500/10">
              <CardContent className="py-4">
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  Sign in with Google Calendar to see your real statistics.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Overview Cards */}
          <div className="mb-8 grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Hours</p>
                    <p className="text-3xl font-bold">{wrapped?.totalFocusedHours || 0}</p>
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
                    <p className="text-3xl font-bold">{wrapped?.blocksCompleted || 0}</p>
                  </div>
                  <Target className="h-10 w-10 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Work Balance</p>
                    <p className="text-3xl font-bold">{wrapped?.weekdayWeekendSplit?.weekdayPercent || 0}%</p>
                    <p className="text-xs text-muted-foreground">weekday</p>
                  </div>
                  <Calendar className="h-10 w-10 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Persona</p>
                    <p className="text-lg font-bold truncate max-w-[120px]">{wrapped?.persona?.name || 'N/A'}</p>
                    <p className="text-xs text-muted-foreground">Your style</p>
                  </div>
                  <Zap className="h-10 w-10 text-yellow-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Persona Section */}
          <Card className="mb-6 bg-gradient-to-br from-purple-900/10 to-blue-900/10 border-purple-500/20">
            <CardContent className="pt-6 flex flex-col md:flex-row items-center gap-6">
                 <div className="h-32 w-32 flex-shrink-0 relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-full blur-xl" />
                    <img 
                        src={wrapped?.persona?.image && PERSONA_IMAGES[wrapped.persona.image] ? PERSONA_IMAGES[wrapped.persona.image] : PERSONA_IMAGES['mario-ai-104.png']} 
                        alt="Persona" 
                        className="relative h-full w-full object-contain"
                    />
                 </div>
                 <div className="text-center md:text-left">
                    <h3 className="text-2xl font-bold mb-2">{wrapped?.persona?.name || 'The Apprentice'}</h3>
                    <p className="text-muted-foreground text-lg">{wrapped?.persona?.description || 'Start working to discover your persona!'}</p>
                 </div>
            </CardContent>
          </Card>

          {/* Weekly Trend Chart */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <h3 className="mb-4">Weekly Trend</h3>
              {(wrapped?.weeklyHours?.length || 0) > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={wrapped?.weeklyHours}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="hours"
                      stroke="#a855f7"
                      strokeWidth={2}
                      dot={{ fill: '#a855f7', strokeWidth: 2, r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[250px] items-center justify-center text-muted-foreground">
                  No weekly data yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Charts */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4">Time by Goal</h3>
                {goalData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={goalData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="hours" fill="#a855f7" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                    No data yet
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="mb-4">Goal Distribution</h3>
                {goalData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={goalData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => entry.name}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="hours"
                      >
                        {goalData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                    No data yet
                  </div>
                )}
              </CardContent>
            </Card>
          </div>



          {/* Achievements */}
          <Card className="mt-6">
            <CardContent className="pt-6">
              <h3 className="mb-4">Achievements</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {(wrapped?.achievements || ['Start scheduling to earn achievements!']).map((achievement, idx) => (
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
          {renderStorySlide(storySlides[currentSlide])}
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
              {storySlides.map((_, idx) => (
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
              disabled={currentSlide === storySlides.length - 1}
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

      <Button
        variant="ghost"
        className="fixed top-4 left-4 text-white hover:bg-white/20"
        onClick={() => navigate('/')}
      >
        <ChevronLeft className="mr-2 h-4 w-4" />
        Back
      </Button>
    </div>
  );
}
