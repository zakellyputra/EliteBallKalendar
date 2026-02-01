import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { ThemeProvider } from './components/ThemeProvider';
import { AuthProvider } from './components/AuthProvider';
import { Toaster } from './components/ui/sonner';

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  );
}