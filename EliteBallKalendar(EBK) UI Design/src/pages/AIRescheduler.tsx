import { useState, useRef, useEffect } from 'react';
import { Navigation } from '../components/Navigation';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Send, Bot, User, Sparkles, Calendar, Clock, MapPin } from 'lucide-react';
import { ScrollArea } from '../components/ui/scroll-area';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestions?: string[];
  reschedulePreview?: RescheduleBlock[];
}

interface RescheduleBlock {
  subject: string;
  originalTime: string;
  newTime: string;
  day: string;
}

const QUICK_PROMPTS = [
  "I'm running late today, reschedule my morning blocks",
  "Move all Friday work to earlier in the week",
  "I need a 2-hour break this afternoon",
  "Reschedule blocks around a doctor's appointment at 2pm tomorrow",
];

export function AIRescheduler() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm your AI scheduling assistant. I can help you reschedule work blocks, adjust your weekly plan, or work around unexpected events. What would you like to change today?",
      timestamp: new Date(),
      suggestions: QUICK_PROMPTS.slice(0, 2),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (message?: string) => {
    const textToSend = message || input;
    if (!textToSend.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const aiResponse = generateAIResponse(textToSend);
      setMessages((prev) => [...prev, aiResponse]);
      setIsTyping(false);
    }, 1500);
  };

  const generateAIResponse = (userInput: string): Message => {
    const lowerInput = userInput.toLowerCase();

    if (lowerInput.includes('late') || lowerInput.includes('morning')) {
      return {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I've found your morning blocks and rescheduled them. Here's the updated plan:",
        timestamp: new Date(),
        reschedulePreview: [
          {
            subject: 'CS251 Study',
            originalTime: '9:00 AM - 10:00 AM',
            newTime: '2:00 PM - 3:00 PM',
            day: 'Today',
          },
          {
            subject: 'Math Homework',
            originalTime: '10:30 AM - 11:30 AM',
            newTime: '3:30 PM - 4:30 PM',
            day: 'Today',
          },
        ],
        suggestions: [
          'Confirm this schedule',
          'Show alternative times',
          'Move to tomorrow instead',
        ],
      };
    }

    if (lowerInput.includes('friday') || lowerInput.includes('week')) {
      return {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I can move your Friday work blocks to earlier in the week. I've found 6 hours of work scheduled for Friday. Here's how I can redistribute them:",
        timestamp: new Date(),
        reschedulePreview: [
          {
            subject: 'Project X',
            originalTime: 'Friday 2:00 PM',
            newTime: 'Wednesday 4:00 PM',
            day: 'Wednesday',
          },
          {
            subject: 'CS251 Study',
            originalTime: 'Friday 3:30 PM',
            newTime: 'Thursday 10:00 AM',
            day: 'Thursday',
          },
          {
            subject: 'Math Homework',
            originalTime: 'Friday 5:00 PM',
            newTime: 'Thursday 2:00 PM',
            day: 'Thursday',
          },
        ],
        suggestions: ['Apply changes', 'Keep some Friday work', 'Show me my updated week'],
      };
    }

    if (lowerInput.includes('break') || lowerInput.includes('afternoon')) {
      return {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'll block out a 2-hour break this afternoon and reschedule any conflicting work blocks:",
        timestamp: new Date(),
        reschedulePreview: [
          {
            subject: 'Break Time',
            originalTime: 'N/A',
            newTime: '2:00 PM - 4:00 PM',
            day: 'Today',
          },
          {
            subject: 'Project X (moved)',
            originalTime: '2:30 PM - 3:30 PM',
            newTime: '5:00 PM - 6:00 PM',
            day: 'Today',
          },
        ],
        suggestions: ['Confirm break', 'Different time?', 'Make it longer'],
      };
    }

    if (lowerInput.includes('doctor') || lowerInput.includes('appointment')) {
      return {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'll add your doctor's appointment at 2pm tomorrow and move any conflicting blocks. I'm also accounting for 30 minutes travel time before and after:",
        timestamp: new Date(),
        reschedulePreview: [
          {
            subject: "Doctor's Appointment",
            originalTime: 'N/A',
            newTime: '2:00 PM - 3:00 PM',
            day: 'Tomorrow',
          },
          {
            subject: 'CS251 Study (moved)',
            originalTime: '2:30 PM - 3:30 PM',
            newTime: '4:00 PM - 5:00 PM',
            day: 'Tomorrow',
          },
        ],
        suggestions: ['Add to calendar', 'Adjust travel time', 'See updated schedule'],
      };
    }

    return {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: "I understand you want to make changes to your schedule. Could you provide more details? For example:\n\n• What time changes do you need?\n• Which specific blocks or subjects?\n• Are there any new events I should know about?",
      timestamp: new Date(),
      suggestions: QUICK_PROMPTS.slice(0, 3),
    };
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container mx-auto px-4 pt-24 pb-12">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-500">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <h1>AI Rescheduler</h1>
            </div>
            <p className="text-muted-foreground">
              Tell me what changed, and I'll help you adjust your schedule in real-time
            </p>
          </div>

          {/* Chat Container */}
          <Card className="border-2">
            <CardContent className="p-0">
              {/* Messages */}
              <ScrollArea className="h-[600px] p-6" ref={scrollRef}>
                <div className="space-y-6">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                      }`}
                    >
                      {/* Avatar */}
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          message.role === 'user'
                            ? 'bg-purple-500'
                            : 'bg-gradient-to-br from-blue-500 to-cyan-500'
                        }`}
                      >
                        {message.role === 'user' ? (
                          <User className="h-4 w-4 text-white" />
                        ) : (
                          <Bot className="h-4 w-4 text-white" />
                        )}
                      </div>

                      {/* Message Content */}
                      <div className={`flex-1 space-y-3 ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                            message.role === 'user'
                              ? 'bg-purple-500 text-white ml-auto'
                              : 'bg-muted'
                          }`}
                        >
                          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                        </div>

                        {/* Reschedule Preview */}
                        {message.reschedulePreview && (
                          <div className="max-w-[80%] space-y-2">
                            {message.reschedulePreview.map((block, idx) => (
                              <div
                                key={idx}
                                className="rounded-lg border border-border bg-card p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <p className="font-medium text-sm">{block.subject}</p>
                                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                      <Calendar className="h-3 w-3" />
                                      <span>{block.day}</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    {block.originalTime !== 'N/A' && (
                                      <p className="text-xs text-muted-foreground line-through">
                                        {block.originalTime}
                                      </p>
                                    )}
                                    <p className="text-sm font-medium text-green-500">
                                      {block.newTime}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Suggestions */}
                        {message.suggestions && (
                          <div className="flex flex-wrap gap-2">
                            {message.suggestions.map((suggestion, idx) => (
                              <Button
                                key={idx}
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={() => handleSend(suggestion)}
                              >
                                {suggestion}
                              </Button>
                            ))}
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground">
                          {message.timestamp.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  ))}

                  {/* Typing Indicator */}
                  {isTyping && (
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-3">
                        <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                        <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                        <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Input Area */}
              <div className="border-t border-border p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Type your request... e.g., 'I'm running late, reschedule my 9am block'"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    className="flex-1"
                  />
                  <Button onClick={() => handleSend()} disabled={!input.trim() || isTyping}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>

                {/* Quick Prompts */}
                {messages.length <= 1 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="text-xs text-muted-foreground">Quick prompts:</span>
                    {QUICK_PROMPTS.map((prompt, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="cursor-pointer hover:bg-secondary/80"
                        onClick={() => handleSend(prompt)}
                      >
                        {prompt}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Info Cards */}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Clock className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-sm font-medium">Real-time Updates</p>
                  <p className="text-xs text-muted-foreground">Changes sync instantly</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <MapPin className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">Location Aware</p>
                  <p className="text-xs text-muted-foreground">Accounts for commute time</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Sparkles className="h-8 w-8 text-pink-500" />
                <div>
                  <p className="text-sm font-medium">Smart Suggestions</p>
                  <p className="text-xs text-muted-foreground">AI-powered recommendations</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
