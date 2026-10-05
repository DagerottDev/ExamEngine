<a id="readme-top"></a>

[![JavaScript][javascript-shield]][javascript-url]
[![HTML5][html-shield]][html-url]
[![Node.js][node-shield]][node-url]
[![Python][python-shield]][python-url]

<div align="center">
  <h1>ExamEngine v2</h1>
  <p>An offline-first MCQ exam and adaptive-study engine that runs in a single HTML file.</p>
  <p>
    <a href="docs/ARCHITECTURE.md">Explore the docs</a>
    · <a href="https://dagerottdev.github.io/ExamEngine/">Open ExamEngine</a>
    · <a href="https://github.com/DagerottDev/ExamEngine/issues">Report a bug</a>
    · <a href="https://github.com/DagerottDev/ExamEngine/issues">Request a feature</a>
  </p>
</div>

<details>
  <summary>Table of Contents</summary>
  <ul>
    <li><a href="#about-the-project">About The Project</a>
      <ul><li><a href="#built-with">Built With</a></li></ul>
    </li>
    <li><a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a>
      <ul>
        <li><a href="#your-first-exam">Your First Exam</a></li>
        <li><a href="#create-and-validate-a-pack">Create and Validate a Pack</a></li>
        <li><a href="#pack-v2-contract">Pack v2 Contract</a></li>
      </ul>
    </li>
    <li><a href="#local-data-and-assessment-boundaries">Local Data and Assessment Boundaries</a></li>
    <li><a href="#development">Development</a></li>
    <li><a href="#free-hosting">Free Hosting</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#support-the-project">Support the Project</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ul>
</details>

## About The Project

ExamEngine helps learners turn reference material into question packs, take exams offline, and use their results to focus the next study session. It pairs a source-grounded MCQ generator skill with a deterministic browser exam engine.

Implemented in v2:

- **Exam and study modes:** single-answer and multi-select questions, sections, review flags, and answer explanations.
- **Pack-defined rules:** weighted marks, negative marking, uniform scoring, and overall, per-question, combined, or untimed sessions.
- **Repeatable delivery:** seeded question and option shuffling with correct-answer mapping preserved.
- **Local continuity:** autosave/resume, recent attempts, a wrong-answer notebook, and light/dark themes.
- **Adaptive follow-up:** topic scores, weak-topic detection, wrong/skipped-question retests, result JSON, and a 15-question adaptive-request export.
- **Content validation:** a versioned JSON contract, source references and confidence metadata, legacy v1 migration in the browser, and a dependency-free Python validator.

The current scope is a single-user offline app. Accounts, cloud sync, instructor administration, and remote proctoring are planned extensions, not implemented features. The browser exports adaptive requests; it does not call an AI service to generate questions itself.

See [Architecture](docs/ARCHITECTURE.md), the [v2 status snapshot dated August 16, 2026](docs/PROJECT_STATUS.md), and the [Roadmap](docs/ROADMAP.md) for more detail.

### Built With

- Vanilla JavaScript, HTML, and CSS for the browser interface and deterministic core.
- Browser `localStorage` for sessions, history, notebook entries, and theme preference.
- Node.js built-ins for the single-file build and core tests.
- Python standard library for pack validation and validator tests.
- GitHub Actions for automated verification and distribution generation.

There are no declared npm dependencies and no backend service requirement.

<p align="right"><a href="#readme-top">Back to top</a></p>

## Getting Started

The repository includes a ready-to-open [offline viewer](mcq-exam-website/index.html) and a [nine-question Cell Biology sample pack](mcq-exam-website/sample-mcq-pack.json). Node.js and Python are needed only for development or CLI validation.

Use [ExamEngine online](https://dagerottdev.github.io/ExamEngine/) or save the
[self-contained HTML](https://dagerottdev.github.io/ExamEngine/index.html) to your
device for offline use. Hosting is free; no login or payment is required.

### Prerequisites

- **Use the viewer:** a browser with JavaScript and local storage enabled. A supported-browser matrix is not yet documented.
- **Clone:** Git and access to this repository.
- **Build and test:** Node.js **20 or newer** with npm, plus Python **3**.
- **Generate questions with the included skill:** an agent environment that supports repository skills, such as Antigravity, and your reference material.

### Installation

1. Clone the repository and enter its directory:

   ```bash
   git clone https://github.com/DagerottDev/ExamEngine.git
   cd ExamEngine
   ```

2. Open `mcq-exam-website/index.html` in your browser. The generated file embeds the styles, JavaScript, and sample pack, so it can run offline without a web server.

No `npm install`, environment variables, API keys, or external services are required to run the viewer. If you already have the checkout, use its existing directory.

If your browser restricts storage for local files, serve the checkout locally instead:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open [the local viewer](http://127.0.0.1:8000/mcq-exam-website/index.html). Keep using the same browser and URL to retain that browser's local history.

<p align="right"><a href="#readme-top">Back to top</a></p>

## Usage

### Your First Exam

1. Open the viewer and leave **Mode** set to **Use pack setting**. Choose shuffle options and an optional seed before loading a pack.
2. Select **Load sample pack** to start the Cell Biology test: nine questions, nine maximum marks, a 15-minute exam limit, and 60 seconds per question. Each wrong answer deducts 0.25 marks.
3. Select answers, move with **Previous**, **Next**, or the question palette, and use **Mark for review** as needed. Multi-select questions require all correct options.
4. Select **Submit exam** and confirm. Review your score, explanations, source references, and topic performance. Topics below 70% of their available marks are identified as weak.
5. Use **Retest wrong answers** for an untimed study session containing wrong and skipped questions, **Export result** to save result JSON, or **Export 15-question adaptive request** to request new targeted questions from the generator.

To study with immediate feedback, choose **Study** before loading a pack and use **Check answer**. Study mode keeps the pack's timing settings; use `timing.mode: "none"` in a pack for untimed study.

To load your own content, drop a JSON pack onto the upload area or click it to browse. Uploads are limited to **5 MiB**. Valid legacy v1 content is migrated for the session; newly generated packs should use schema v2.

Saved unfinished sessions appear on the landing page with **Resume** and **Discard** controls. The overall exam deadline continues to elapse while the page is closed. Per-question remaining time is preserved across navigation, so revisiting a question does not grant a fresh timer. When the overall timer expires, the exam submits automatically; when a question timer expires, the viewer moves forward or submits at the last question.

Keyboard shortcuts during a session: **← / →** navigate, **F** marks for review, and **A–H** select the corresponding option.

### Create and Validate a Pack

Open the repository in your agent environment and invoke the [mcq-pack-generator skill](.agents/skills/mcq-pack-generator/SKILL.md). Supply the exact question count, source material, and, when available, two to five representative target-exam questions. Include timing and scoring preferences if needed.

The generator skill is open source under the same MIT license as the app.
In Codex, open the repository and invoke `$mcq-pack-generator`; in another
compatible agent, load its `SKILL.md` using that tool's skill mechanism.
To reuse it in another project, copy the **entire**
`.agents/skills/mcq-pack-generator/` directory, including `LICENSE`, `scripts/`,
`resources/`, and `examples/`. For a copy installed elsewhere, validate with
`python3 <skill-folder>/scripts/validate_pack.py <pack.json>`.

Generation runs in your own AI tool, separately from the free website. Any AI
provider charges depend on your tool and account. You can also author packs
manually using the schema; the skill is not required to load a valid JSON pack.
Only publish question packs and reference material you have permission to share.

The skill maps sources, calibrates difficulty, plans coverage, generates questions, and checks grounding, distractors, duplicates, answer-position balance, metadata, and marks consistency before validation. Without a sample paper, it uses moderate difficulty and reports that the difficulty was inferred. Its default output directory is `mcq-packs/`.

Validate any generated or hand-edited pack from the repository root:

```bash
python3 .agents/skills/mcq-pack-generator/scripts/validate_pack.py path/to/pack.json
```

For an adaptive follow-up, supply the exported request and the relevant reference material to the generator. The request contains weak topics, prior wrong/skipped question IDs, subject, source provenance, a count of 15, and a hard target difficulty. Generate new stems, then validate and upload the new pack.

### Pack v2 Contract

Use the [canonical schema](schema/mcq-pack.v2.schema.json) and [complete sample pack](mcq-exam-website/sample-mcq-pack.json) as references. This complete one-question example uses both timers and question-level scoring:

```json
{
  "schemaVersion": "2.0",
  "exam": {
    "title": "Cell Biology Practice",
    "subject": "Biology",
    "examType": "Practice",
    "totalMarks": 1
  },
  "difficulty": "easy",
  "timing": {
    "mode": "both",
    "examDurationSeconds": 300,
    "defaultQuestionSeconds": 60
  },
  "scoring": { "mode": "question" },
  "delivery": {
    "mode": "exam",
    "shuffleQuestions": false,
    "shuffleOptions": false,
    "seed": "cell-practice-01"
  },
  "questions": [
    {
      "id": 1,
      "question": "Ribosomes are composed of which of the following?",
      "options": ["RNA and proteins", "DNA and proteins", "Lipids and RNA", "Only proteins"],
      "answerIndex": 0,
      "marks": 1,
      "negativeMarks": 0.25,
      "explanation": "Ribosomes are nucleoprotein complexes made of rRNA and proteins.",
      "topic": "Cell organelles",
      "difficulty": "easy",
      "cognitiveLevel": "remember",
      "learningObjective": "Recall ribosome composition.",
      "sourceRefs": ["cell-unit:p2"],
      "tags": ["ribosome", "rRNA"],
      "confidence": 0.99
    }
  ]
}
```

- Answer indices are **zero-based**. Single-answer questions use `answerIndex`; multi-select questions use `multiSelect: true` and `answerIndices`, with no `answerIndex`. Multi-select correctness is exact-set and all-or-nothing.
- Timing modes are `none`, `exam`, `question`, and `both`. Per-question limits can override the default with `questionTimeSeconds`.
- Scoring modes are `question` and `uniform`. `exam.totalMarks` must equal the sum of question marks, or `questions.length × scoring.correctMarks` for uniform scoring. Uniform scoring also requires `scoring.negativeMarks`.
- Optional sections use matching section IDs on questions. Learning metadata includes topic, difficulty, cognitive level, learning objective, source references, tags, and confidence.

<p align="right"><a href="#readme-top">Back to top</a></p>

## Local Data and Assessment Boundaries

Sessions, attempt history, theme preference, and the wrong-answer notebook are stored in browser `localStorage`. ExamEngine does not upload these records to a server. History retains up to 100 attempts and the notebook up to 500 entries; the landing page displays the ten most recent attempts and twenty most recent notebook entries.

Data belongs to the browser profile and origin. It does not automatically follow you across devices, profiles, or between the hosted site, a local file, and a locally served URL. Clearing browser storage removes saved sessions and history. Export results you want to keep.

The hosted page requires a connection to load; the downloaded HTML can run
offline. GitHub's hosting service may collect access logs, and selecting source
or support links opens an external site. ExamEngine itself does not upload packs
or attempts to GitHub or payment providers.

This is a personal-study tool with answers included in its JSON packs. It has no account system, remote proctoring, or server-side assessment integrity controls. Source links in packs may open external pages when selected.

<p align="right"><a href="#readme-top">Back to top</a></p>

## Development

Run commands from the repository root. No dependency installation is needed.

```bash
npm run verify
npm run build:check
```

`verify` runs the Node core tests, Python validator tests, and sample-pack validation. `build:check` checks that the committed offline viewer matches the current sources without rewriting it.

After editing source files or the embedded sample, regenerate the distribution:

```bash
npm run build
```

For individual checks, use `npm test`, `npm run test:validator`, or `npm run validate:sample`.

| Path | Purpose |
| --- | --- |
| [`src/core/exam-engine.js`](src/core/exam-engine.js) | Validation, migration, seeded delivery, timing, scoring, and analytics |
| [`src/app.js`](src/app.js) | Browser workflow, persistence, review, retests, and exports |
| [`src/index.html`](src/index.html), [`src/styles.css`](src/styles.css) | Development shell and styles |
| [`scripts/build.mjs`](scripts/build.mjs) | Combines source and sample into the offline HTML file |
| [`mcq-exam-website/`](mcq-exam-website/) | Generated viewer and sample pack |
| [`schema/`](schema/) | Canonical v2 JSON Schema |
| [`.agents/skills/mcq-pack-generator/`](.agents/skills/mcq-pack-generator/) | Generator workflow, schema copy, examples, and Python validator |
| [`tests/`](tests/) | Core and validator tests |
| [`docs/`](docs/) | Architecture, dated project status, and roadmap |

Edit the modular files in `src/`, then build; direct changes to the generated viewer will be overwritten. For browser development, serve the repository with the local-server command above and open [the source shell](http://127.0.0.1:8000/src/index.html). The raw source shell needs a server for its JavaScript modules and sample fetch; the generated viewer embeds both.

The [CI workflow](.github/workflows/ci.yml) runs core tests, validator tests, sample validation, and the build on pull requests and pushes to `main` or `goal/**`. On successful push runs, it commits and pushes the regenerated viewer if the output changed. Current automated coverage targets core logic and validation; comprehensive browser E2E coverage remains a roadmap item.

After verification, pushes to `main` also deploy the built viewer to GitHub Pages.
Pull requests and `goal/**` branches do not deploy. A manual workflow run on
`main` can redeploy the current version.

<p align="right"><a href="#readme-top">Back to top</a></p>

## Free Hosting

ExamEngine uses static GitHub Pages hosting at
[dagerottdev.github.io/ExamEngine](https://dagerottdev.github.io/ExamEngine/).
The app needs no server, database, or paid hosting subscription.

To host your own fork:

1. Create a public repository on GitHub. GitHub Pages supports public repositories
   on GitHub Free.
2. Open **Settings → Pages → Build and deployment → Source** and select
   **GitHub Actions**.
3. Push a change to `main`, or run **Actions → ExamEngine CI → Run workflow**
   on `main`. Tests and validation must pass before deployment.
4. Find your site URL in **Settings → Pages** or the workflow's `github-pages`
   deployment. A project site normally uses `https://<owner>.github.io/<repo>/`.
5. Update this README and the source/support links for your fork, retaining the
   MIT notices. Run `npm run build` after changing source files.

CI publishes only `mcq-exam-website/`, including the viewer, sample JSON, and a
license copy. The generator is shared through the source repository and runs in
users' own AI tools.

Use the supplied `github.io` address to keep hosting at **₹0**. A purchased
domain, AI generation, and payment-provider fees are separate optional costs.
GitHub Pages has usage limits and is not intended for paid SaaS or sites primarily
focused on commercial transactions; this app stays free with optional external
support links. See [GitHub Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
and [usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

<p align="right"><a href="#readme-top">Back to top</a></p>

## Roadmap

The [documented roadmap](docs/ROADMAP.md) prioritizes browser reliability: E2E workflows, reload/resume timing, accessibility, storage recovery, and large-pack performance. Later phases cover richer adaptive learning, pack authoring, release engineering, and optional hosted/instructor workflows.

These are planned milestones. See the roadmap for scope and exit criteria.

<p align="right"><a href="#readme-top">Back to top</a></p>

## Contributing

Discuss bugs and proposed changes through [repository issues][issues-url] or a pull request. Include the pack, reproduction steps, and browser details for exam-workflow problems. Run `npm run verify` and `npm run build:check` before submitting changes; regenerate the viewer when source or sample content changes.

<p align="right"><a href="#readme-top">Back to top</a></p>

## License

Distributed under the [MIT License](LICENSE). This covers the app, documentation,
schemas, and author-owned generator skill and examples. The skill includes its
own license copy, and the generated HTML embeds the full notice for offline reuse.
Third-party source books, papers, and user-supplied material retain their own rights.

<p align="right"><a href="#readme-top">Back to top</a></p>

## Support the Project

ExamEngine is free to use. If it helps your study sessions, you can support its
development:

- [Buy me a coffee](https://buymeacoffee.com/dagerottdev) — international support.
- [Buy me a chai on Bondin](https://bondin.io/dagerottdev) — support from India.

Support is optional. Payments are handled on the providers' websites; their fees
and terms apply. Bug reports, contributions, and documentation improvements are
welcome too.

<p align="right"><a href="#readme-top">Back to top</a></p>

## Contact

Use the [ExamEngine repository][repository-url] and [issue tracker][issues-url] for project support.

<p align="right"><a href="#readme-top">Back to top</a></p>

## Acknowledgments

- The included biology sample pack credits *NCERT Biology — Class XI*, “Cell: The Unit of Life,” as its source material.
- README layout inspired by [Best-README-Template](https://github.com/othneildrew/Best-README-Template).

<p align="right"><a href="#readme-top">Back to top</a></p>

[repository-url]: https://github.com/DagerottDev/ExamEngine
[issues-url]: https://github.com/DagerottDev/ExamEngine/issues
[javascript-shield]: https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black
[javascript-url]: https://developer.mozilla.org/en-US/docs/Web/JavaScript
[html-shield]: https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white
[html-url]: https://developer.mozilla.org/en-US/docs/Web/HTML
[node-shield]: https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white
[node-url]: https://nodejs.org/
[python-shield]: https://img.shields.io/badge/Python-3-3776AB?style=for-the-badge&logo=python&logoColor=white
[python-url]: https://www.python.org/
