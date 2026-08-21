const fs = require('fs');

// Minimal Mock Browser DOM
const elements = {};
function createMockElement(id, tag = 'div') {
  return {
    id,
    tagName: tag.toUpperCase(),
    classList: {
      _classes: new Set(),
      add: function(...c) { c.forEach(x => this._classes.add(x)); },
      remove: function(...c) { c.forEach(x => this._classes.delete(x)); },
      contains: function(c) { return this._classes.has(c); },
      toggle: function(c) { if (this.contains(c)) this.remove(c); else this.add(c); }
    },
    dataset: {},
    style: {},
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    addEventListener: function(event, handler) {
      if (!this._listeners) this._listeners = {};
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(handler);
    },
    dispatchEvent: function(event) {
      if (this._listeners && this._listeners[event.type]) {
        this._listeners[event.type].forEach(h => h(event));
      }
    },
    click: function() {
      this.dispatchEvent({ type: 'click', target: this });
    },
    focus: function() {},
    querySelectorAll: function(sel) { return []; },
    closest: function(sel) { return this; }
  };
}

global.window = {
  addEventListener: (event, handler) => {},
  dispatchEvent: (event) => {},
  navigator: {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile; Chrome/128.0) AppleWebKit/537.36'
  }
};

global.document = {
  readyState: 'complete',
  body: createMockElement('body'),
  getElementById: (id) => {
    if (!elements[id]) elements[id] = createMockElement(id);
    return elements[id];
  },
  querySelectorAll: (sel) => [],
  addEventListener: (event, handler) => {}
};

global.localStorage = {
  _store: {},
  getItem: (k) => global.localStorage._store[k] || null,
  setItem: (k, v) => { global.localStorage._store[k] = v; }
};

global.CustomEvent = function(type, detail) { return { type, detail }; };
global.navigator = global.window.navigator;

const html = fs.readFileSync('index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/i);
const jsCode = scriptMatch[1];

eval(jsCode);

console.log('✓ Successfully booted app in simulated Android Chrome / iPad environment!');
console.log('Live clock text:', elements['kiosk-live-clock'] ? elements['kiosk-live-clock'].textContent : 'none');
console.log('Period header label:', elements['kiosk-period-label'] ? elements['kiosk-period-label'].textContent : 'none');
