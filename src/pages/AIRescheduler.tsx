import { useState, useRef, useEffect } from 'react';
import { Navigation } from '../components/Navigation';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Send, Bot, User, Sparkles, Calendar, Clock, ChevronDown, ChevronUp, Check, Loader2, Volume2, Trash2 } from 'lucide-react';
import { ScrollArea } from '../components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible';
import { useAuthContext } from '../components/AuthProvider';
import { reschedule } from '../lib/api';
import type { RescheduleResponse, RescheduleOperation } from '../lib/api';
import { toast } from 'sonner';
import { VoiceInput } from '../components/VoiceInput';
import { VoiceOutput } from '../components/VoiceOutput';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestions?: string[];
  operations?: RescheduleOperation[];
  rawJson?: string;
  tokenStats?: {
    rawChars: number;
    compressedChars: number;
  };
  intent?: string;
}

const QUICK_PROMPTS = [
  "I'm running late today, reschedule my morning blocks",
  "Move all Friday work to earlier in the week",
  "I need a 2-hour break this afternoon",
  "Reschedule blocks around a doctor's appointment at 2pm tomorrow",
  "I lost 2 hours today, recover them later this week",
  "Move CS251 to weekend only",
];

export function AIRescheduler() {
  const { isAuthenticated } = useAuthContext();
  const [messages, setMessages] = useState<Message[]>(() => {
    // Try to load from localStorage
    const saved = localStorage.getItem('ai-chat-history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Convert string timestamps back to Date objects
        return parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
      } catch (e) {
        console.error('Failed to parse chat history', e);
      }
    }
    return [
      {
        id: '1',
        role: 'assistant',
        content: "Hi! I'm your AI scheduling assistant powered by Gemini. I can help you reschedule work blocks, adjust your weekly plan, or work around unexpected events. What would you like to change today?",
        timestamp: new Date(),
        suggestions: QUICK_PROMPTS.slice(0, 3),
      },
    ];
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [pendingOperations, setPendingOperations] = useState<RescheduleOperation[]>([]);
  const [applyingChanges, setApplyingChanges] = useState(false);
  const [showJsonDrawer, setShowJsonDrawer] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist messages to localStorage
  useEffect(() => {
    localStorage.setItem('ai-chat-history', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Clear history function
  const clearHistory = () => {
    const initialMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: "Chat history cleared. How can I help you with your schedule?",
      timestamp: new Date(),
      suggestions: QUICK_PROMPTS.slice(0, 3),
    };
    setMessages([initialMessage]);
    localStorage.removeItem('ai-chat-history');
  };

  const handleVoiceInput = (transcript: string) => {
    setInput(transcript);
    // Optionally auto-send
    // handleSend(transcript);
    toast.success('Voice input received!');
  };

  const handleSend = async (message?: string) => {
    const textToSend = message || input;
    if (!textToSend.trim()) return;

    if (!isAuthenticated) {
      toast.error('Please sign in with Google Calendar first');
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    const history = messages
      .filter(m => m.id !== userMessage.id) // Exclude current message
      .map(m => ({ role: m.role, content: m.content }));

    const result = await reschedule.request(textToSend, history);

    if (result.error) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Sorry, I encountered an error: ${result.error}`,
          timestamp: new Date(),
          suggestions: QUICK_PROMPTS.slice(0, 2),
        },
      ]);
    } else if (result.data) {
      const data = result.data;
      setPendingOperations(data.operations);

      const isOutsideHours = data.intent === 'confirm_outside_hours';

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.user_message,
          timestamp: new Date(),
          operations: data.operations,
          rawJson: JSON.stringify(data, null, 2),
          tokenStats: {
            rawChars: data.rawContextChars,
            compressedChars: data.compressedChars,
          },
          intent: data.intent,
          suggestions: data.operations.length > 0
            ? (isOutsideHours
                ? ['Yes, proceed anyway', 'Cancel']
                : ['Confirm these changes', 'Show alternative times'])
            : QUICK_PROMPTS.slice(0, 2),
        },
      ]);
    }

    setIsTyping(false);
  };

  const handleApplyChanges = async () => {
    if (pendingOperations.length === 0) return;

    setApplyingChanges(true);
    const result = await reschedule.apply(pendingOperations);

    if (result.error) {
      toast.error(`Failed to apply changes: ${result.error}`);
    } else if (result.data) {
      toast.success(`Applied ${result.data.applied} changes to your calendar!`);
      setPendingOperations([]);
      
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Done! I've applied ${result.data?.applied} changes to your calendar. ${result.data?.blocksMovedCount} blocks were moved, recovering ${result.data?.minutesRecovered} minutes of focus time.`,
          timestamp: new Date(),
          suggestions: ['Show me my updated schedule', 'Make another change'],
        },
      ]);
    }

    setApplyingChanges(false);
  };

  const formatOperation = (op: RescheduleOperation): string => {
    switch (op.op) {
      case 'move':
        return `Move "${op.title || 'block'}" to ${new Date(op.to!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${new Date(op.to!).toLocaleDateString()}`;
      case 'create':
        return `Create "${op.title || op.goalName || 'block'}" at ${new Date(op.start!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      case 'delete':
        return `Remove "${op.title || op.blockId}"`;
      default:
        return JSON.stringify(op);
    }
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
              {/* Powered by Gemini Badge */}
              <Badge variant="outline" className="ml-2 gap-1">
                <span className="text-blue-500">✦</span> Powered by Gemini
              </Badge>
              <Button 
                variant="ghost" 
                size="sm" 
                className="ml-auto text-xs text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (confirm('Are you sure you want to clear the chat history?')) {
                    clearHistory();
                  }
                }}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear History
              </Button>
            </div>
            <p className="text-muted-foreground">
              Tell me what changed, and I'll help you adjust your schedule in real-time
            </p>
          </div>

          {!isAuthenticated && (
            <Card className="mb-6 border-yellow-500/50 bg-yellow-500/10">
              <CardContent className="py-4">
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  Sign in with Google Calendar to use the AI Rescheduler.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Chat Container */}
          <Card className="border-2">
            <CardContent className="p-0">
              {/* Messages */}
              <ScrollArea className="h-[500px] p-6" ref={scrollRef}>
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

                        {/* Operations Preview */}
                        {message.operations && message.operations.length > 0 && (
                          <div className="max-w-[80%] space-y-2">
                            {/* Warning for outside working hours */}
                            {message.intent === 'confirm_outside_hours' && (
                              <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
                                <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                                  ⚠️ Outside Working Hours
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  This will schedule blocks outside your configured working window. Confirm if you want to proceed.
                                </p>
                              </div>
                            )}
                            <p className="text-xs font-medium text-muted-foreground">
                              Proposed changes:
                            </p>
                            {message.operations.map((op, idx) => (
                              <div
                                key={idx}
                                className={`rounded-lg border p-3 ${
                                  message.intent === 'confirm_outside_hours'
                                    ? 'border-yellow-500/50 bg-yellow-500/5'
                                    : 'border-border bg-card'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-purple-500" />
                                    <span className="text-sm">{formatOperation(op)}</span>
                                  </div>
                                  <Badge variant="secondary" className="text-xs">
                                    {op.op}
                                  </Badge>
                                </div>
                              </div>
                            ))}

                            {/* Apply Button and Voice Output */}
                            <div className="flex gap-2 mt-2">
                              <Button
                                onClick={handleApplyChanges}
                                disabled={applyingChanges}
                                className={message.intent === 'confirm_outside_hours'
                                  ? 'bg-yellow-600 hover:bg-yellow-700'
                                  : 'bg-green-600 hover:bg-green-700'
                                }
                              >
                                {applyingChanges ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Applying...
                                  </>
                                ) : (
                                  <>
                                    <Check className="mr-2 h-4 w-4" />
                                    {message.intent === 'confirm_outside_hours'
                                      ? 'Confirm & Apply Anyway'
                                      : 'Apply Changes'
                                    }
                                  </>
                                )}
                              </Button>
                              <VoiceOutput
                                text={message.content}
                                disabled={!isAuthenticated}
                              />
                            </div>
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
                    disabled={!isAuthenticated}
                  />
                  <VoiceInput 
                    onTranscript={handleVoiceInput} 
                    disabled={!isAuthenticated || isTyping} 
                  />
                  <Button onClick={() => handleSend()} disabled={!input.trim() || isTyping || !isAuthenticated}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>

                {/* Quick Prompts */}
                {messages.length <= 1 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="text-xs text-muted-foreground">Quick prompts:</span>
                    {QUICK_PROMPTS.slice(0, 4).map((prompt, idx) => (
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
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/10">
                  <Clock className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Real-time Updates</p>
                  <p className="text-xs text-muted-foreground">Changes sync to Google Calendar</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
                  <span className="text-blue-500 text-lg">✦</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Powered by Gemini</p>
                  <p className="text-xs text-muted-foreground">AI understands natural language</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/10">
                  <Sparkles className="h-5 w-5 text-cyan-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Bear1 Compression</p>
                  <p className="text-xs text-muted-foreground">Efficient context handling</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
