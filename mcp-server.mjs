#!/usr/bin/env node
import { runMcpServer } from './lib/mcp.mjs'
runMcpServer({ stdin: process.stdin, stdout: process.stdout })
