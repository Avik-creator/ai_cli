import chalk from "chalk";
import boxen, { type Options as BoxenOptions } from "boxen";

export type TuiTone = "primary" | "info" | "success" | "warning" | "error" | "neutral";

function borderColorForTone(tone: TuiTone): NonNullable<BoxenOptions["borderColor"]> {
  switch (tone) {
    case "primary":
      return "cyan";
    case "info":
      return "blue";
    case "success":
      return "green";
    case "warning":
      return "yellow";
    case "error":
      return "red";
    case "neutral":
    default:
      return "gray";
  }
}

function titleColorForTone(tone: TuiTone): (input: string) => string {
  switch (tone) {
    case "primary":
      return chalk.bold.cyan;
    case "info":
      return chalk.bold.blue;
    case "success":
      return chalk.bold.green;
    case "warning":
      return chalk.bold.yellow;
    case "error":
      return chalk.bold.red;
    case "neutral":
    default:
      return chalk.bold.white;
  }
}

export function createPanel(
  title: string,
  body: string,
  options: {
    tone?: TuiTone;
    borderStyle?: BoxenOptions["borderStyle"];
    padding?: BoxenOptions["padding"];
    margin?: BoxenOptions["margin"];
    dimBorder?: boolean;
    titleAlignment?: "left" | "center" | "right";
  } = {}
): string {
  const tone = options.tone ?? "neutral";
  const titleFormatter = titleColorForTone(tone);

  return boxen(body, {
    padding: options.padding ?? 1,
    margin: options.margin,
    borderStyle: options.borderStyle ?? "round",
    borderColor: borderColorForTone(tone),
    dimBorder: options.dimBorder,
    title: titleFormatter(title),
    titleAlignment: options.titleAlignment ?? "left",
  });
}

export function renderDivider(char: string = "─", fallbackLength: number = 72): string {
  const width = process.stdout.columns && process.stdout.columns > 20
    ? Math.min(process.stdout.columns - 2, 96)
    : fallbackLength;
  return chalk.gray(char.repeat(width));
}

export function formatCommandRows(
  rows: Array<{ command: string; description: string }>
): string {
  const commandWidth = Math.max(...rows.map((row) => row.command.length), 0) + 2;
  return rows
    .map((row) => `${chalk.cyan(row.command.padEnd(commandWidth))}${chalk.gray(row.description)}`)
    .join("\n");
}

export function formatKeyValueRows(
  rows: Array<{ key: string; value: string }>
): string {
  const keyWidth = Math.max(...rows.map((row) => row.key.length), 0) + 2;
  return rows
    .map((row) => `${chalk.bold.white(row.key.padEnd(keyWidth))}${chalk.gray(row.value)}`)
    .join("\n");
}

export function formatList(items: string[], color: "cyan" | "gray" | "green" | "yellow" | "white" = "gray"): string {
  const colorFn =
    color === "cyan"
      ? chalk.cyan
      : color === "green"
      ? chalk.green
      : color === "yellow"
      ? chalk.yellow
      : color === "white"
      ? chalk.white
      : chalk.gray;

  return items.map((item) => `${colorFn("•")} ${item}`).join("\n");
}

