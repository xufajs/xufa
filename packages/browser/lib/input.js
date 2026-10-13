// The keyboard and the mouse of a page, through Input.dispatchKeyEvent and Input.dispatchMouseEvent: keys by name
// (Enter, Tab, ArrowDown, Control+a...) as Playwright names them, and characters, which type their text.

// Keys that are not characters: [key, code, keyCode].
const NAMED = [
  ['Enter', 'Enter', 13, '\r'],
  ['Tab', 'Tab', 9],
  ['Escape', 'Escape', 27],
  ['Backspace', 'Backspace', 8],
  ['Delete', 'Delete', 46],
  ['Insert', 'Insert', 45],
  ['Home', 'Home', 36],
  ['End', 'End', 35],
  ['PageUp', 'PageUp', 33],
  ['PageDown', 'PageDown', 34],
  ['ArrowLeft', 'ArrowLeft', 37],
  ['ArrowUp', 'ArrowUp', 38],
  ['ArrowRight', 'ArrowRight', 39],
  ['ArrowDown', 'ArrowDown', 40],
  ['Shift', 'ShiftLeft', 16],
  ['Control', 'ControlLeft', 17],
  ['Alt', 'AltLeft', 18],
  ['Meta', 'MetaLeft', 91],
  ['Space', 'Space', 32, ' '],
  ...Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, `F${i + 1}`, 112 + i]),
];
const KEYS = new Map(
  NAMED.map(([key, code, keyCode, text]) => [key, { key: key === 'Space' ? ' ' : key, code, keyCode, text }])
);
const MODIFIERS = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };
// (ControlOrMeta: Meta on macOS, Control elsewhere, as Playwright reads it.)
const CONTROL_OR_META = process.platform === 'darwin' ? 'Meta' : 'Control';

// A character as a key: its code and keyCode on a US keyboard, when it has one.
function characterKey(char) {
  if (/^[a-z]$/i.test(char)) {
    return { key: char, code: `Key${char.toUpperCase()}`, keyCode: char.toUpperCase().charCodeAt(0), text: char };
  }
  if (/^[0-9]$/.test(char)) return { key: char, code: `Digit${char}`, keyCode: char.charCodeAt(0), text: char };
  if (char === ' ') return { key: ' ', code: 'Space', keyCode: 32, text: ' ' };
  if (char === '\n' || char === '\r') return { ...KEYS.get('Enter') };
  return { key: char, code: '', keyCode: 0, text: char };
}

function keyOf(name) {
  if (KEYS.has(name)) return { ...KEYS.get(name) };
  if ([...name].length === 1) return characterKey(name);
  throw new Error(`Unknown key: "${name}"`);
}

class Keyboard {
  constructor(session) {
    this.session = session;
    this.modifiers = 0;
  }

  async down(name) {
    const key = keyOf(name);
    if (name in MODIFIERS) this.modifiers |= MODIFIERS[name]; // eslint-disable-line no-bitwise
    // With Control, Alt or Meta held, a character is a shortcut: no text.
    const text = this.modifiers & ~MODIFIERS.Shift ? undefined : key.text; // eslint-disable-line no-bitwise
    await this.session.send('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      key: key.key,
      code: key.code,
      windowsVirtualKeyCode: key.keyCode,
      modifiers: this.modifiers,
      ...(text ? { text, unmodifiedText: text } : {}),
    });
  }

  async up(name) {
    const key = keyOf(name);
    if (name in MODIFIERS) this.modifiers &= ~MODIFIERS[name]; // eslint-disable-line no-bitwise
    await this.session.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: key.key,
      code: key.code,
      windowsVirtualKeyCode: key.keyCode,
      modifiers: this.modifiers,
    });
  }

  /** A key, or keys held together: 'Enter', 'Shift+Tab', 'Control+a'. */
  async press(combination, { delay = 0 } = {}) {
    const names =
      combination === '+'
        ? ['+']
        : combination.split('+').map((name) => (name === 'ControlOrMeta' ? CONTROL_OR_META : name));
    const key = names.pop();
    for (const modifier of names) await this.down(modifier);
    await this.down(key);
    if (delay) await new Promise((done) => setTimeout(done, delay));
    await this.up(key);
    for (const modifier of names.reverse()) await this.up(modifier);
  }

  /** Characters, one key each. */
  async type(text, { delay = 0 } = {}) {
    for (const char of text) {
      await this.press(char);
      if (delay) await new Promise((done) => setTimeout(done, delay));
    }
  }

  /** Text as an input method gives it: no keys. */
  async insertText(text) {
    await this.session.send('Input.insertText', { text });
  }
}

const BUTTONS = { left: 1, right: 2, middle: 4 };

class Mouse {
  constructor(session, keyboard) {
    this.session = session;
    this.keyboard = keyboard;
    this.x = 0;
    this.y = 0;
    this.buttons = 0;
    this.button = 'none';
  }

  async move(x, y, { steps = 1 } = {}) {
    const fromX = this.x;
    const fromY = this.y;
    for (let step = 1; step <= steps; step += 1) {
      this.x = fromX + ((x - fromX) * step) / steps;
      this.y = fromY + ((y - fromY) * step) / steps;
      await this.session.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: this.x,
        y: this.y,
        button: this.button,
        buttons: this.buttons,
        modifiers: this.keyboard.modifiers,
      });
    }
  }

  async down({ button = 'left', clickCount = 1 } = {}) {
    this.button = button;
    this.buttons |= BUTTONS[button]; // eslint-disable-line no-bitwise
    await this.session.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: this.x,
      y: this.y,
      button,
      buttons: this.buttons,
      clickCount,
      modifiers: this.keyboard.modifiers,
    });
  }

  async up({ button = 'left', clickCount = 1 } = {}) {
    this.buttons &= ~BUTTONS[button]; // eslint-disable-line no-bitwise
    this.button = 'none';
    await this.session.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: this.x,
      y: this.y,
      button,
      buttons: this.buttons,
      clickCount,
      modifiers: this.keyboard.modifiers,
    });
  }

  async click(x, y, { button = 'left', clickCount = 1, delay = 0 } = {}) {
    await this.move(x, y);
    for (let count = 1; count <= clickCount; count += 1) {
      await this.down({ button, clickCount: count });
      if (delay) await new Promise((done) => setTimeout(done, delay));
      await this.up({ button, clickCount: count });
    }
  }

  async dblclick(x, y, options = {}) {
    await this.click(x, y, { ...options, clickCount: 2 });
  }

  async wheel(deltaX, deltaY) {
    await this.session.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: this.x,
      y: this.y,
      deltaX,
      deltaY,
      modifiers: this.keyboard.modifiers,
    });
  }
}

export { Keyboard, Mouse };
