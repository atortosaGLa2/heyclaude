export interface TerminalAdapter {
  name: string;
  isAvailable(): boolean;
  open(renderCmd: string): boolean;
  close(): void;
  isRunning(): boolean;
}
