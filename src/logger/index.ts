import { getEnv } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'user_msg';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

class Logger {
  private logLevel: LogLevel;

  constructor() {
    const env = getEnv();
    this.logLevel = (env.LOG_LEVEL as LogLevel) || 'info';
  }

  private formatDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `[${day}/${month}/${year}] ${hours}:${minutes}`;
  }

  private getColorCode(level: LogLevel): string {
    switch (level) {
      case 'info':
        return '\x1b[37m'; // white
      case 'warn':
        return '\x1b[33m'; // yellow
      case 'error':
        return '\x1b[31m'; // red
      case 'debug':
        return '\x1b[90m'; // gray
      case 'user_msg':
        return '\x1b[36m'; // cyan
      default:
        return '\x1b[37m';
    }
  }

  private resetColor(): string {
    return '\x1b[0m';
  }

  private log(level: LogLevel, message: string): void {
    const timestamp = this.formatDate(new Date());
    const levelDisplay = level.toUpperCase().replace('_', ' ');
    const colorCode = this.getColorCode(level);
    const formatted = `${timestamp} — [${levelDisplay}] ${message}`;

    console.log(`${colorCode}${formatted}${this.resetColor()}`);
  }

  info(message: string): void {
    this.log('info', message);
  }

  warn(message: string): void {
    this.log('warn', message);
  }

  error(message: string): void {
    this.log('error', message);
  }

  debug(message: string): void {
    if (this.logLevel === 'debug') {
      this.log('debug', message);
    }
  }

  /**
   * Log incoming user message in WhatsApp
   * Format: [dd/mm/yyyy] hh:mm — [USER MSG] 📱 +55XXXXXXXXXX | "user message text"
   */
  userMessage(phoneNumber: string, message: string): void {
    const timestamp = this.formatDate(new Date());
    const formatted = `${timestamp} — [USER MSG] 📱 ${phoneNumber} | "${message}"`;
    const colorCode = this.getColorCode('user_msg');
    console.log(`${colorCode}${formatted}${this.resetColor()}`);
  }

  /**
   * Log outgoing message to user
   * Format: [dd/mm/yyyy] hh:mm — [BOT MSG] 📤 +55XXXXXXXXXX | message sent
   */
  botMessage(phoneNumber: string, message: string): void {
    const timestamp = this.formatDate(new Date());
    const formatted = `${timestamp} — [BOT MSG] 📤 ${phoneNumber} | ${message}`;
    const colorCode = this.getColorCode('info');
    console.log(`${colorCode}${formatted}${this.resetColor()}`);
  }
}

export const logger = new Logger();
