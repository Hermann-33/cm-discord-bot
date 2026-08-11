type Stoppable = { stop(): void };
type Destroyable = { destroy(): void };

export function createShutdownHandler(
  schedule: Stoppable,
  discordClient: Destroyable,
  exit: (exitCode: number) => void
): (exitCode: number) => Promise<void> {
  let isShuttingDown = false;

  return async (exitCode: number): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    schedule.stop();
    discordClient.destroy();
    exit(exitCode);
  };
}
