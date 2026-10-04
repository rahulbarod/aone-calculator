// Speech-to-text for customer names, using the browser's built-in
// recognition when present. Callers fall back to the keyboard otherwise.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let current = null;

const tidy = text => text
  .replace(/[.,!?]+$/, '')
  .trim()
  .replace(/\b\p{L}/gu, c => c.toUpperCase());

export const voice = {
  supported: !!SR,

  listen(lang = 'en-IN') {
    return new Promise((resolve, reject) => {
      if (!SR) return reject('unsupported');
      const r = new SR();
      current = r;
      r.lang = lang;
      r.interimResults = false;
      r.maxAlternatives = 1;
      let settled = false;
      r.onresult = e => {
        settled = true;
        resolve(tidy(e.results[0][0].transcript));
      };
      r.onerror = e => {
        settled = true;
        reject(e.error || 'error');
      };
      r.onend = () => {
        current = null;
        if (!settled) reject('no-speech');
      };
      r.start();
    });
  },

  stop() {
    if (current) current.stop();
  },

  errorMessage(err) {
    switch (err) {
      case 'not-allowed':
      case 'service-not-allowed': return 'Microphone permission denied — please type the name';
      case 'network': return 'Voice needs internet — please type the name';
      case 'no-speech': return "Didn't hear a name — try again or type it";
      case 'aborted': return 'Voice input stopped';
      case 'unsupported': return 'Voice input not available here — please type';
      default: return 'Voice input failed — please type the name';
    }
  },
};
