#!/usr/bin/env node
import { createCLI } from "./cli.js";

const program = createCLI();

if (process.argv.length < 3) {
  process.argv.push("chat");
}

program.parse(process.argv);
