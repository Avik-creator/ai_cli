import { spawn, type ChildProcess } from "child_process";

export function installPackage(packageName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let installCommand = ["add"];
    if (packageName.startsWith("@ai-sdk/")) {
      installCommand.push(`${packageName}@latest`);
    } else {
      installCommand.push(packageName);
    }

    const bun = spawn("bun", installCommand, {
      stdio: "inherit",
      shell: true,
      cwd: process.cwd(),
    }) as ChildProcess;

    bun.on("close", (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Installation failed with code ${code}`));
      }
    });

    bun.on("error", (error: Error) => {
      reject(error);
    });
  });
}
