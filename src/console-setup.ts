const PATTERNS = [
  'forwardRef render functions accept exactly two parameters',
  '`overlayClassName` is deprecated',
  'pseudo class ":first-child" is potentially unsafe',
  'WebSocket is closed before the connection is established',
];

function match(msg: unknown): boolean {
  return typeof msg === 'string' && PATTERNS.some(p => msg.includes(p));
}

const _w = console.warn;
console.warn = (...a: unknown[]) => { if (!match(a[0])) _w(...a); };

const _e = console.error;
console.error = (...a: unknown[]) => { if (!match(a[0])) _e(...a); };
