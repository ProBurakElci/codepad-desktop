/*
 * A starting snippet for every language.
 *
 * For the three that run, the sample is something whose output is worth
 * looking at. For the rest it is a small, idiomatic piece that shows the
 * highlighting doing its job.
 */
(function (global) {
  "use strict";

  const SAMPLES = {
    javascript: `// Runs for real, in a sandboxed worker.
// Ctrl+Enter to run.

const primes = [];
for (let n = 2; primes.length < 10; n++) {
  if (primes.every((p) => n % p !== 0)) primes.push(n);
}

console.log("first ten primes:", primes);

const people = [
  { name: "Ada", born: 1815 },
  { name: "Alan", born: 1912 },
  { name: "Grace", born: 1906 },
];

for (const person of people.sort((a, b) => a.born - b.born)) {
  console.log(person.born + "  " + person.name);
}

// The last expression is shown as the result.
people.map((p) => p.name).join(", ");
`,

    typescript: `// TypeScript is highlighted here, not compiled.
// Strip the types and it will run as JavaScript.

interface Person {
  name: string;
  born: number;
}

const people: Person[] = [
  { name: "Ada", born: 1815 },
  { name: "Grace", born: 1906 },
];

function oldest(list: Person[]): Person {
  return list.reduce((a, b) => (a.born < b.born ? a : b));
}

console.log(oldest(people).name);
`,

    python: `# Runs for real. Python is downloaded the first time you press Run.

def fizzbuzz(n):
    for i in range(1, n + 1):
        if i % 15 == 0:
            print("FizzBuzz")
        elif i % 3 == 0:
            print("Fizz")
        elif i % 5 == 0:
            print("Buzz")
        else:
            print(i)

fizzbuzz(15)

squares = [x * x for x in range(1, 11)]
print("squares:", squares)
print("sum:", sum(squares))
`,

    html: `<!-- Rendered in a sandboxed frame. Edit and press Run. -->
<!DOCTYPE html>
<html>
<head>
<style>
  body {
    font-family: system-ui, sans-serif;
    background: #0d1526;
    color: #e9eefa;
    display: grid;
    place-items: center;
    height: 100vh;
    margin: 0;
  }
  .card {
    background: #111b2e;
    border: 1px solid #1e2b45;
    border-radius: 18px;
    padding: 32px 40px;
    text-align: center;
  }
  button {
    margin-top: 14px;
    background: #38bdf8;
    border: 0;
    border-radius: 10px;
    padding: 10px 18px;
    font-size: 15px;
    cursor: pointer;
  }
</style>
</head>
<body>
  <div class="card">
    <h1 id="count">0</h1>
    <button onclick="bump()">press me</button>
  </div>
  <script>
    let n = 0;
    function bump() {
      n++;
      document.getElementById("count").textContent = n;
    }
  </script>
</body>
</html>
`,

    css: `/* Highlighted here. Put it inside an HTML snippet to see it render. */

:root {
  --accent: #38bdf8;
  --radius: 14px;
}

.card {
  background: #111b2e;
  border: 1px solid #1e2b45;
  border-radius: var(--radius);
  padding: 20px;
  transition: transform 0.15s ease;
}

.card:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
}

@media (max-width: 600px) {
  .card { padding: 14px; }
}
`,

    json: `{
  "name": "codepad",
  "version": "1.0.0",
  "languages": 17,
  "runs": ["javascript", "python", "html"],
  "dependencies": {},
  "private": false
}
`,

    sql: `-- Highlighted here; there is no database in your browser to run it against.

SELECT
    c.name,
    COUNT(o.id)   AS orders,
    SUM(o.total)  AS spent
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE o.created_at >= '2026-01-01'
GROUP BY c.name
HAVING COUNT(o.id) > 2
ORDER BY spent DESC
LIMIT 10;
`,

    java: `public class Main {
    public static void main(String[] args) {
        int[] numbers = {5, 3, 9, 1, 7};
        int total = 0;

        for (int n : numbers) {
            total += n;
        }

        System.out.println("sum: " + total);
        System.out.println("average: " + (total / (double) numbers.length));
    }
}
`,

    c: `#include <stdio.h>

int fib(int n) {
    return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

int main(void) {
    for (int i = 0; i < 10; i++) {
        printf("%d ", fib(i));
    }
    printf("\\n");
    return 0;
}
`,

    csharp: `using System;
using System.Linq;

class Program {
    static void Main() {
        var numbers = new[] { 5, 3, 9, 1, 7 };
        var sorted = numbers.OrderBy(n => n).ToArray();

        Console.WriteLine(string.Join(", ", sorted));
        Console.WriteLine($"sum: {numbers.Sum()}");
    }
}
`,

    go: `package main

import "fmt"

func main() {
    primes := []int{}

    for n := 2; len(primes) < 10; n++ {
        isPrime := true
        for _, p := range primes {
            if n%p == 0 {
                isPrime = false
                break
            }
        }
        if isPrime {
            primes = append(primes, n)
        }
    }

    fmt.Println(primes)
}
`,

    rust: `fn main() {
    let names = vec!["Ada", "Alan", "Grace"];

    for (i, name) in names.iter().enumerate() {
        println!("{}. {}", i + 1, name);
    }

    let total: i32 = (1..=10).sum();
    println!("sum of 1..10 = {}", total);
}
`,

    php: `<?php

function greet(string $name): string {
    return "Hello, " . $name;
}

$people = ["Ada", "Alan", "Grace"];

foreach ($people as $person) {
    echo greet($person), PHP_EOL;
}

echo count($people), " people", PHP_EOL;
`,

    ruby: `class Greeter
  def initialize(name)
    @name = name
  end

  def greet
    puts "Hello, #{@name}"
  end
end

%w[Ada Alan Grace].each do |name|
  Greeter.new(name).greet
end

puts (1..10).sum
`,

    shell: `#!/bin/sh
# Find the biggest folders in the current directory.

for dir in */; do
  size=$(du -sh "$dir" 2>/dev/null | cut -f1)
  echo "$size  $dir"
done | sort -h | tail -10
`,

    yaml: `name: tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node test/run-tests.js
`,

    markdown: `# codepad

A code editor that runs in your browser.

## What runs

- **JavaScript** — in a sandboxed worker
- **Python** — downloaded the first time you press Run
- **HTML** — rendered in a sandboxed frame

> Everything else is highlighted, and the page says so
> rather than pretending.

\`\`\`js
console.log("hello");
\`\`\`
`,
  };

  function get(languageId) {
    return SAMPLES[languageId] || SAMPLES.javascript;
  }

  global.Samples = { SAMPLES: SAMPLES, get: get };
  if (typeof module !== "undefined" && module.exports) module.exports = global.Samples;
})(typeof window !== "undefined" ? window : globalThis);
