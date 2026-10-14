import type { Difficulty } from "@codementor/shared";

export interface SeedCase {
  input: string;
  expected: string;
  sample?: boolean;
  explanation?: string;
}

export interface SeedProblem {
  slug: string;
  title: string;
  difficulty: Difficulty;
  topics: string[];
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  cases: SeedCase[];
  /** Reference solution used ONLY by tests, to prove every expected output is correct. */
  reference: (input: string) => string;
}

export const SEED_TOPICS: { name: string; slug: string }[] = [
  { name: "Arrays", slug: "arrays" },
  { name: "Strings", slug: "strings" },
  { name: "Hash Tables", slug: "hash-tables" },
  { name: "Stacks", slug: "stacks" },
  { name: "Binary Search", slug: "binary-search" },
  { name: "Dynamic Programming", slug: "dynamic-programming" },
  { name: "Graphs", slug: "graphs" },
  { name: "Two Pointers", slug: "two-pointers" },
];

const nums = (text: string): number[] => text.split(/\s+/).filter(Boolean).map(Number);
const lines = (text: string): string[] => text.replace(/\r/g, "").split("\n");

export const SEED_PROBLEMS: SeedProblem[] = [
  {
    slug: "two-sum",
    title: "Two Sum",
    difficulty: "EASY",
    topics: ["arrays", "hash-tables"],
    description:
      "Given an array of integers and a target, find the two different positions whose values add up to the target. Exactly one such pair exists.",
    inputFormat: "Line 1: n and target. Line 2: n integers.",
    outputFormat: "Two 0-based indices i and j with i < j, separated by a space.",
    constraints: "2 <= n <= 100000. Values fit in a 32-bit signed integer. Exactly one valid pair.",
    cases: [
      { input: "4 9\n2 7 11 15\n", expected: "0 1", sample: true, explanation: "2 + 7 = 9" },
      { input: "3 6\n3 2 4\n", expected: "1 2", sample: true, explanation: "2 + 4 = 6" },
      { input: "2 6\n3 3\n", expected: "0 1" },
      { input: "5 -3\n5 0 4 -1 -2\n", expected: "3 4" },
      { input: "6 26\n1 5 9 14 12 3\n", expected: "3 4" },
    ],
    reference: (input) => {
      const [head = "", rest = ""] = lines(input);
      const [n = 0, target = 0] = nums(head);
      const a = nums(rest).slice(0, n);
      const seen = new Map<number, number>();
      for (let j = 0; j < a.length; j++) {
        const i = seen.get(target - (a[j] as number));
        if (i !== undefined) return `${i} ${j}`;
        seen.set(a[j] as number, j);
      }
      return "";
    },
  },
  {
    slug: "valid-parentheses",
    title: "Valid Parentheses",
    difficulty: "EASY",
    topics: ["stacks", "strings"],
    description:
      "A string contains only the characters ( ) [ ] { }. It is valid if every opening bracket is closed by the same type of bracket, in the correct order.",
    inputFormat: "One line with the bracket string.",
    outputFormat: "YES if the string is valid, otherwise NO.",
    constraints: "1 <= length <= 100000.",
    cases: [
      { input: "()[]{}\n", expected: "YES", sample: true },
      { input: "(]\n", expected: "NO", sample: true, explanation: "( is closed by ]" },
      { input: "{[()]}\n", expected: "YES" },
      { input: "([)]\n", expected: "NO" },
      { input: "((\n", expected: "NO" },
      { input: ")\n", expected: "NO" },
    ],
    reference: (input) => {
      const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
      const stack: string[] = [];
      for (const ch of (lines(input)[0] ?? "").trim()) {
        if (ch in pairs) {
          if (stack.pop() !== pairs[ch]) return "NO";
        } else stack.push(ch);
      }
      return stack.length === 0 ? "YES" : "NO";
    },
  },
  {
    slug: "reverse-words",
    title: "Reverse Words",
    difficulty: "EASY",
    topics: ["strings", "two-pointers"],
    description:
      "Reverse the order of the words in a sentence. Letters inside each word stay the same.",
    inputFormat: "One line of words separated by single spaces (no leading or trailing spaces).",
    outputFormat: "The words in reverse order, separated by single spaces.",
    constraints: "1 <= number of words <= 1000. Each word has at most 50 characters.",
    cases: [
      { input: "the sky is blue\n", expected: "blue is sky the", sample: true },
      { input: "hello\n", expected: "hello", sample: true },
      { input: "a b c d e\n", expected: "e d c b a" },
      { input: "CodeMentor AI rocks\n", expected: "rocks AI CodeMentor" },
      { input: "I love coding\n", expected: "coding love I" },
    ],
    reference: (input) => (lines(input)[0] ?? "").trim().split(" ").reverse().join(" "),
  },
  {
    slug: "maximum-subarray",
    title: "Maximum Subarray",
    difficulty: "MEDIUM",
    topics: ["arrays", "dynamic-programming"],
    description:
      "Find the contiguous, non-empty part of an array that has the largest sum, and print that sum.",
    inputFormat: "Line 1: n. Line 2: n integers.",
    outputFormat: "The largest possible sum.",
    constraints: "1 <= n <= 100000. |value| <= 10000.",
    cases: [
      {
        input: "9\n-2 1 -3 4 -1 2 1 -5 4\n",
        expected: "6",
        sample: true,
        explanation: "4 -1 2 1 = 6",
      },
      { input: "5\n5 4 -1 7 8\n", expected: "23", sample: true },
      { input: "1\n1\n", expected: "1" },
      { input: "3\n-3 -1 -2\n", expected: "-1" },
      { input: "7\n-2 -3 4 -1 -2 1 5\n", expected: "7" },
      { input: "4\n0 0 0 0\n", expected: "0" },
    ],
    reference: (input) => {
      const [head = "", rest = ""] = lines(input);
      const a = nums(rest).slice(0, nums(head)[0]);
      let best = a[0] as number;
      let cur = a[0] as number;
      for (let i = 1; i < a.length; i++) {
        cur = Math.max(a[i] as number, cur + (a[i] as number));
        best = Math.max(best, cur);
      }
      return String(best);
    },
  },
  {
    slug: "binary-search",
    title: "Binary Search",
    difficulty: "EASY",
    topics: ["binary-search", "arrays"],
    description:
      "Given a sorted array of distinct integers and a target, print the index of the target, or -1 if it is not present. Aim for O(log n).",
    inputFormat: "Line 1: n and target. Line 2: n integers in ascending order.",
    outputFormat: "The 0-based index of target, or -1.",
    constraints: "1 <= n <= 100000. All values are distinct.",
    cases: [
      { input: "6 9\n-1 0 3 5 9 12\n", expected: "4", sample: true },
      { input: "6 2\n-1 0 3 5 9 12\n", expected: "-1", sample: true },
      { input: "1 5\n5\n", expected: "0" },
      { input: "5 1\n1 2 3 4 5\n", expected: "0" },
      { input: "5 5\n1 2 3 4 5\n", expected: "4" },
      { input: "4 7\n1 3 5 8\n", expected: "-1" },
    ],
    reference: (input) => {
      const [head = "", rest = ""] = lines(input);
      const [n = 0, target = 0] = nums(head);
      const a = nums(rest).slice(0, n);
      let lo = 0;
      let hi = a.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (a[mid] === target) return String(mid);
        if ((a[mid] as number) < target) lo = mid + 1;
        else hi = mid - 1;
      }
      return "-1";
    },
  },
  {
    slug: "climbing-stairs",
    title: "Climbing Stairs",
    difficulty: "EASY",
    topics: ["dynamic-programming"],
    description:
      "You climb a staircase of n steps, taking either 1 or 2 steps at a time. In how many distinct ways can you reach the top?",
    inputFormat: "One integer n.",
    outputFormat: "The number of distinct ways.",
    constraints: "1 <= n <= 45 (the answer fits in a 64-bit integer).",
    cases: [
      { input: "2\n", expected: "2", sample: true, explanation: "1+1 or 2" },
      { input: "3\n", expected: "3", sample: true, explanation: "1+1+1, 1+2, 2+1" },
      { input: "1\n", expected: "1" },
      { input: "5\n", expected: "8" },
      { input: "10\n", expected: "89" },
      { input: "30\n", expected: "1346269" },
      { input: "45\n", expected: "1836311903" },
    ],
    reference: (input) => {
      const n = nums(input)[0] as number;
      let a = 1;
      let b = 1;
      for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
      return String(b);
    },
  },
  {
    slug: "longest-common-subsequence",
    title: "Longest Common Subsequence",
    difficulty: "MEDIUM",
    topics: ["strings", "dynamic-programming"],
    description:
      "A subsequence keeps the original order but may skip characters. Print the length of the longest subsequence that appears in both strings.",
    inputFormat: "Line 1: string A. Line 2: string B.",
    outputFormat: "The length of the longest common subsequence.",
    constraints: "1 <= length of each string <= 1000. Strings contain no spaces.",
    cases: [
      { input: "abcde\nace\n", expected: "3", sample: true, explanation: "ace" },
      { input: "abc\nabc\n", expected: "3", sample: true },
      { input: "abc\ndef\n", expected: "0" },
      { input: "AGGTAB\nGXTXAYB\n", expected: "4" },
      { input: "aaaa\naa\n", expected: "2" },
      { input: "abcbdab\nbdcaba\n", expected: "4" },
    ],
    reference: (input) => {
      const [a = "", b = ""] = lines(input).map((s) => s.trim());
      const dp = Array.from({ length: a.length + 1 }, () =>
        new Array<number>(b.length + 1).fill(0),
      );
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          dp[i]![j] =
            a[i - 1] === b[j - 1]
              ? (dp[i - 1]![j - 1] as number) + 1
              : Math.max(dp[i - 1]![j] as number, dp[i]![j - 1] as number);
        }
      }
      return String(dp[a.length]![b.length]);
    },
  },
  {
    slug: "number-of-islands",
    title: "Number of Islands",
    difficulty: "MEDIUM",
    topics: ["graphs", "arrays"],
    description:
      "A grid contains 1 (land) and 0 (water). An island is a group of land cells connected up, down, left or right (not diagonally). Count the islands.",
    inputFormat: "Line 1: R and C. Then R lines, each with C characters (0 or 1, no spaces).",
    outputFormat: "The number of islands.",
    constraints: "1 <= R, C <= 300.",
    cases: [
      { input: "4 5\n11110\n11010\n11000\n00000\n", expected: "1", sample: true },
      { input: "4 5\n11000\n11000\n00100\n00011\n", expected: "3", sample: true },
      { input: "1 1\n1\n", expected: "1" },
      { input: "1 1\n0\n", expected: "0" },
      { input: "3 3\n101\n010\n101\n", expected: "5" },
      { input: "2 4\n1111\n1111\n", expected: "1" },
    ],
    reference: (input) => {
      const [head = "", ...rows] = lines(input);
      const [r = 0, c = 0] = nums(head);
      const grid = rows.slice(0, r).map((row) => row.trim().split(""));
      let count = 0;
      const stack: [number, number][] = [];
      for (let i = 0; i < r; i++) {
        for (let j = 0; j < c; j++) {
          if (grid[i]![j] !== "1") continue;
          count++;
          grid[i]![j] = "0";
          stack.push([i, j]);
          while (stack.length) {
            const [x, y] = stack.pop() as [number, number];
            for (const [dx, dy] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ] as const) {
              if (grid[x + dx]?.[y + dy] === "1") {
                grid[x + dx]![y + dy] = "0";
                stack.push([x + dx, y + dy]);
              }
            }
          }
        }
      }
      return String(count);
    },
  },
  {
    slug: "coin-change",
    title: "Coin Change",
    difficulty: "MEDIUM",
    topics: ["dynamic-programming"],
    description:
      "Given coin denominations (each usable any number of times) and an amount, print the fewest coins needed to make exactly that amount, or -1 if it is impossible.",
    inputFormat: "Line 1: n (number of coin types) and amount. Line 2: n coin values.",
    outputFormat: "The minimum number of coins, or -1.",
    constraints: "1 <= n <= 12. 1 <= coin value <= 10000. 0 <= amount <= 10000.",
    cases: [
      { input: "3 11\n1 2 5\n", expected: "3", sample: true, explanation: "5 + 5 + 1" },
      { input: "1 3\n2\n", expected: "-1", sample: true },
      { input: "1 0\n1\n", expected: "0" },
      { input: "3 6\n1 3 4\n", expected: "2" },
      { input: "2 7\n2 4\n", expected: "-1" },
      { input: "4 27\n1 5 10 25\n", expected: "3" },
    ],
    reference: (input) => {
      const [head = "", rest = ""] = lines(input);
      const [n = 0, amount = 0] = nums(head);
      const coins = nums(rest).slice(0, n);
      const dp = new Array<number>(amount + 1).fill(Infinity);
      dp[0] = 0;
      for (let a = 1; a <= amount; a++) {
        for (const c of coins)
          if (c <= a) dp[a] = Math.min(dp[a] as number, (dp[a - c] as number) + 1);
      }
      return String(Number.isFinite(dp[amount]) ? dp[amount] : -1);
    },
  },
  {
    slug: "trapping-rain-water",
    title: "Trapping Rain Water",
    difficulty: "HARD",
    topics: ["arrays", "two-pointers"],
    description:
      "Each number is the height of a bar of width 1. After it rains, how many units of water are trapped between the bars?",
    inputFormat: "Line 1: n. Line 2: n non-negative integers (bar heights).",
    outputFormat: "The total units of trapped water.",
    constraints: "1 <= n <= 100000. 0 <= height <= 100000.",
    cases: [
      { input: "12\n0 1 0 2 1 0 1 3 2 1 2 1\n", expected: "6", sample: true },
      { input: "6\n4 2 0 3 2 5\n", expected: "9", sample: true },
      { input: "1\n5\n", expected: "0" },
      { input: "3\n3 0 3\n", expected: "3" },
      { input: "5\n1 2 3 4 5\n", expected: "0" },
      { input: "5\n5 4 3 2 1\n", expected: "0" },
      { input: "4\n2 0 2 0\n", expected: "2" },
    ],
    reference: (input) => {
      const [head = "", rest = ""] = lines(input);
      const h = nums(rest).slice(0, nums(head)[0]);
      let l = 0;
      let r = h.length - 1;
      let leftMax = 0;
      let rightMax = 0;
      let water = 0;
      while (l < r) {
        if ((h[l] as number) < (h[r] as number)) {
          leftMax = Math.max(leftMax, h[l] as number);
          water += leftMax - (h[l] as number);
          l++;
        } else {
          rightMax = Math.max(rightMax, h[r] as number);
          water += rightMax - (h[r] as number);
          r--;
        }
      }
      return String(water);
    },
  },
];
