import { Calendar, MessageSquare, BarChart3, Settings, Moon, Sun } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Button } from './ui/button';
import { useTheme } from './ThemeProvider';

export function Navigation() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const navItems = [
    { path: '/', icon: Calendar, label: 'Dashboard' },
    { path: '/reschedule', icon: MessageSquare, label: 'AI Reschedule' },
    { path: '/stats', icon: BarChart3, label: 'Statistics' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{
                background: 'linear-gradient(to bottom right, var(--brand-primary), var(--brand-secondary))'
              }}>
                <span className="text-sm font-bold text-white">EBK</span>
              </div>
              <span className="text-lg font-semibold">Elite Ball Kalendar</span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link key={item.path} to={item.path}>
                    <Button
                      variant={isActive ? 'secondary' : 'ghost'}
                      size="sm"
                      className="gap-2"
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Button>
                  </Link>
                );
              })}
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </nav>
  );
}