import type { Language } from "@codementor/shared";

// Generic starting points. Every problem reads from standard input and writes to standard output,
// which works the same way in all five languages.
export const STARTER_CODE: Record<Language, string> = {
  PYTHON: `import sys


def main():
    data = sys.stdin.read().split()
    # Read the input as described, then print the answer.


main()
`,
  JAVASCRIPT: `const data = require("fs").readFileSync(0, "utf8").split(/\\s+/).filter(Boolean);
// Read the input as described, then print the answer with console.log().
`,
  JAVA: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // Read the input as described, then print the answer.
    }
}
`,
  CPP: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // Read the input as described, then print the answer.
    return 0;
}
`,
  C: `#include <stdio.h>

int main(void) {
    /* Read the input as described, then print the answer. */
    return 0;
}
`,
};
