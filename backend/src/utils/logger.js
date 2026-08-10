const isProduction = process.env.NODE_ENV === 'production';

function format(prefix, args) {
  return [`[${prefix}]`, ...args];
}

export const logger = {
  info(...args) {
    if (!isProduction) {
      console.log(...format('Status', args));
    }
  },
  warn(...args) {
    console.warn(...format('Status', args));
  },
  error(...args) {
    console.error(...format('Status', args));
  },
};
