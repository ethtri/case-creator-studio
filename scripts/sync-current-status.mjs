import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const backlogPath = path.join(repoRoot, "Docs", "BACKLOG.md");
const statusPath = path.join(repoRoot, "Docs", "CURRENT_STATUS.md");

const backlog = fs.readFileSync(backlogPath, "utf8");
const status = fs.readFileSync(statusPath, "utf8");

const lines = backlog.split(/\r?\n/);
const p0Start = lines.findIndex((line) => line.trim() === "## P0 (MVP Launch)");
let p0Tasks = [];

if (p0Start !== -1) {
  for (let i = p0Start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("## ")) break;
    const match = line.match(/^\s*-\s*\[ \]\s*(.+)$/);
    if (match) p0Tasks.push(match[1].trim());
  }
}

const formatTask = (task) => `P0: ${task}`;
const top3 = p0Tasks.slice(0, 3).map(formatTask);
const nowTask = p0Tasks[0] ? [formatTask(p0Tasks[0])] : ["None"];
const nextTasks = p0Tasks.slice(1, 3).map(formatTask);
const laterTasks = p0Tasks.slice(3).map(formatTask);

const date = new Date().toISOString().slice(0, 10);
const user = process.env.USERNAME || process.env.USER || "unknown";

const top3Block = [
  "## Top 3 Next Tasks",
  ...top3.map((task, idx) => `${idx + 1}. ${task}`),
].join("\n");

const nowNextLaterBlock = [
  "## Now / Next / Later",
  "**Now**",
  ...nowTask.map((task) => `- ${task}`),
  "",
  "**Next**",
  ...(nextTasks.length ? nextTasks.map((task) => `- ${task}`) : ["- None"]),
  "",
  "**Later**",
  ...(laterTasks.length ? laterTasks.map((task) => `- ${task}`) : ["- None"]),
].join("\n");

let updated = status.replace(
  /^\*\*Last updated:\*\* .*/m,
  `**Last updated:** ${date}`
);

updated = updated.replace(
  /^\*\*Last updated by:\*\* .*/m,
  `**Last updated by:** ${user}`
);

updated = updated.replace(
  /## Top 3 Next Tasks[\s\S]*?## Now \/ Next \/ Later/,
  `${top3Block}\n\n## Now / Next / Later`
);

updated = updated.replace(
  /## Now \/ Next \/ Later[\s\S]*?## Notes/,
  `${nowNextLaterBlock}\n\n## Notes`
);

fs.writeFileSync(statusPath, updated, "utf8");
console.log("Updated CURRENT_STATUS.md from BACKLOG.md");
