#!/usr/bin/env node

/**
 * Build script for npm package
 * This ensures the dist directory is properly set up before publishing
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const distDir = join(process.cwd(), "dist");

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
  console.log("✅ Created dist directory");
} else {
  console.log("✅ dist directory exists");
}

console.log("✅ Build preparation complete");

