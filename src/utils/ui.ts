import chalk from "chalk";
import boxen, { type Options as BoxenOptions } from "boxen";

export function info(message: string): void {
  console.log(chalk.cyan(message));
}

export function success(message: string): void {
  console.log(chalk.green(message));
}

export function error(message: string): void {
  console.log(chalk.red(message));
}

export function warning(message: string): void {
  console.log(chalk.yellow(message));
}

export function dim(message: string): void {
  console.log(chalk.gray(message));
}

export function bold(message: string): void {
  console.log(chalk.bold(message));
}

export function infoBox(message: string, options?: BoxenOptions): void {
  console.log(
    boxen(chalk.cyan(message), {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderStyle: "round",
      borderColor: "cyan",
      ...options,
    })
  );
}

export function successBox(message: string, options?: BoxenOptions): void {
  console.log(
    boxen(chalk.green(`✅ ${message}`), {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderStyle: "round",
      borderColor: "green",
      ...options,
    })
  );
}

export function errorBox(message: string, options?: BoxenOptions): void {
  console.log(
    boxen(chalk.red(`❌ ${message}`), {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderStyle: "round",
      borderColor: "red",
      ...options,
    })
  );
}

export function warningBox(message: string, options?: BoxenOptions): void {
  console.log(
    boxen(chalk.yellow(`⚠️  ${message}`), {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderStyle: "round",
      borderColor: "yellow",
      ...options,
    })
  );
}

export function heading(title: string): void {
  console.log(chalk.bold.cyan(`\n${title}\n`));
}

export function subheading(title: string): void {
  console.log(chalk.cyan.bold(`\n${title}:`));
}

export function item(label: string, value?: string): void {
  if (value) {
    console.log(`  ${label}: ${value}`);
  } else {
    console.log(`  ${label}`);
  }
}

export function itemCheck(label: string, checked: boolean): void {
  const marker = checked ? chalk.green("✓") : chalk.yellow("✗");
  console.log(`  ${marker} ${label}`);
}

export function itemCurrent(label: string): void {
  console.log(`  ${chalk.green("✓")} ${chalk.white(label)}`);
}

export function section(label: string): void {
  console.log(chalk.bold(`\n${label}:\n`));
}

export function divider(): void {
  console.log(chalk.gray("─".repeat(60)));
}

export function newline(): void {
  console.log("");
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}
