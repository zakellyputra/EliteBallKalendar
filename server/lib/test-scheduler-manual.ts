
import { calculateSchedule } from './scheduler-logic';

async function runTest() {
  console.log('Starting Scheduler Logic Test...');

  // 1. Mock Data
  const mockGoals = [
    {
      id: 'gym-goal',
      name: 'GYM',
      targetMinutesPerWeek: 600, // 10 hours
      sessionsPerWeek: 5,        // 5 sessions (2 hours each)
      preferredTime: { start: '06:00', end: '09:00' }, // Early morning (Outside 9-5 working window)
    },
    {
      id: 'math-goal',
      name: 'Math',
      targetMinutesPerWeek: 180, // 3 hours
      sessionsPerWeek: 3,        // 1 hour each
      // No preferred time
    }
  ];

  const mockSettings = {
    workingWindow: {
      monday: { enabled: true, start: '09:00', end: '17:00' },
      tuesday: { enabled: true, start: '09:00', end: '17:00' },
      wednesday: { enabled: true, start: '09:00', end: '17:00' },
      thursday: { enabled: true, start: '09:00', end: '17:00' },
      friday: { enabled: true, start: '09:00', end: '17:00' },
      saturday: { enabled: false, start: '09:00', end: '17:00' },
      sunday: { enabled: false, start: '09:00', end: '17:00' },
    },
    blockLengthMinutes: 60,
    minGapMinutes: 10,
    timezone: 'America/New_York',
  };

  const mockEvents: any[] = []; // No existing busy events

  // Week range: Mon Jan 22 2024 - Sun Jan 28 2024
  const weekStart = new Date('2024-01-22T00:00:00.000Z');
  const weekEnd = new Date('2024-01-28T23:59:59.999Z');

  // 2. Run Scheduler Logic
  try {
    const result = calculateSchedule(
      mockGoals,
      mockSettings,
      mockEvents,
      weekStart,
      weekEnd
    );
    
    console.log('\n--- Proposed Blocks ---');
    result.proposedBlocks.forEach(b => {
      const date = new Date(b.start);
      // Format manually to avoid timezone confusion in logs
      const day = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' });
      const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
      const endTime = new Date(b.end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
      
      console.log(`[${b.goalName}] ${day} ${time} - ${endTime}`);
    });

    // 3. Validation
    console.log('\n--- Validation ---');
    
    // Check GYM sessions (Should be 5, early morning)
    const gymBlocks = result.proposedBlocks.filter(b => b.goalName === 'GYM');
    const gymDays = new Set(gymBlocks.map(b => new Date(b.start).getDate()));
    
    console.log(`GYM Sessions: ${gymBlocks.length} (Target: 5) - ${gymBlocks.length === 5 ? 'PASS' : 'FAIL'}`);
    console.log(`GYM Unique Days: ${gymDays.size} (Target: 5) - ${gymDays.size === 5 ? 'PASS' : 'FAIL'}`);
    
    // Check times for GYM
    const gymTimesCorrect = gymBlocks.every(b => {
      const date = new Date(b.start);
      // Convert to NY time
      const hour = parseInt(date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }));
      return hour >= 6 && hour < 9;
    });
    console.log(`GYM Times are 6-9 AM: ${gymTimesCorrect ? 'PASS' : 'FAIL'}`);

    // Check Math sessions
    const mathBlocks = result.proposedBlocks.filter(b => b.goalName === 'Math');
    console.log(`Math Sessions: ${mathBlocks.length} (Target: 3) - ${mathBlocks.length === 3 ? 'PASS' : 'FAIL'}`);
    
    // Check Math distribution (should be spread out, e.g. Mon/Wed/Fri)
    const mathDays = mathBlocks.map(b => new Date(b.start).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' }));
    console.log(`Math Days: ${mathDays.join(', ')}`);

  } catch (e) {
    console.error('Error running scheduler:', e);
  }
}

runTest();
