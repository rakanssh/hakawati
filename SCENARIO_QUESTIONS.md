# Scenario questions

Write a question where its answer should appear. Hakawati asks the player before starting the tale and replaces every occurrence with their answer.

```text
Your name is ${What is your name?}.
Your job is ${What is your job? | options: Baker, Guard}.
```

- `${Question?}` accepts text.
- `${Question? | options: A, B}` offers suggestions and also accepts custom text.
- `${Question? | choices: A, B}` requires one of the listed answers.

Every question requires an answer. Repeat the exact same question to reuse it: `${What is your job?}` uses the job selected above. Leading/trailing spaces are ignored; capitalization matters. Declare each list once, or repeat it identically.

Questions work in opening text, plot, author's note, AI instructions, story-card titles/content/triggers, and stat/inventory names/descriptions. They do not work in listing titles, browsing descriptions, tags, IDs, categories or numbers. Questions appear in that order, starting with opening text; each field is read from beginning to end.

Use a backslash to include delimiters inside a question or choice:

```text
${What is your name? | choices: Lee\, Sam, Noor}
```

Escape `|`, `}`, `,` or a backslash itself with a backslash. Write `\${This stays literal}` to keep a placeholder as ordinary text. When editing exported JSON directly, JSON requires each backslash to be doubled.

You can save a draft with unfinished questions. Fix errors before publishing or starting it. Existing field limits include the placeholder text, so keep questions short and put long option lists in a prompt section; use the bare question in shorter fields such as triggers.

Answers are inserted once as text. There are no scripts, conditions, nested questions, defaults or skipped questions. The original scenario stays unchanged, and resuming a tale does not repeat setup. Sharing a scenario made from an existing tale shares its filled-in content.
