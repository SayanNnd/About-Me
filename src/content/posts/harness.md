## Why I ran this
 
Everyone argues about which model is the best one. Almost nobody talks about the thing wrapped around it: the **harness**. That's the program that decides which tools the model gets, what runs before and after each step, when it asks for permission, and how much it checks its own work.
 
So I ran a small experiment. My friend and I used the **same model** (Claude Opus 5.5), the **same API provider**, and the **exact same two prompts**. I used Claude CLI. He used Opencode. Then we put what came out side by side.
 
The question I wanted answered: **does the harness even matter, or is it all just the model?**
 
*(Spoiler: it matters, just not in the place I expected.)*
 
## The setup
 
The two prompts were:
 
1. **Build a "Developer Pomodoro & Ambient Soundscape Dashboard"**: Vite + React + TypeScript + Tailwind v4, a timer, a procedural Web Audio mixer and a task queue. A long, very specific spec with strict rules like "write multiple files per step" and "run the build once".
2. **"go a bit more creative and non generic with the ui, make it more expressive, unique and animative... and add more sound options while improving/changing the current ones because the rain and deep drone does not sound very good"**
 
Here's what was the same and what wasn't:
 
| | Claude CLI (me) | Opencode (my friend) |
|---|---|---|
| Main model | Claude Opus 5.5 | Claude Opus 5.5 |
| Provider | Same API provider | Same API provider |
| Prompts | Identical | Identical |
| Helper model | Sonnet 5 making side calls | Almost none |
| Permission mode | Auto mode | Plan mode |
| Extras loaded | A dataviz skill, context7 | Superpowers skills (brainstorming, planning, TDD, code review, verification), context7, review subagents |
 
<p class="edit-note">[Yes, it loaded a dataviz skill to build a Pomodoro timer. I have no idea either.]</p>
 
## How I measured it
 
My provider shows a **Charged** number for every request. It isn't raw tokens, it's weighted. I fitted the weights from the provider's pricing page against every request row, and they matched to within half a unit:
 
| | Input | Output | Cache write | Cache read |
|---|---|---|---|---|
| Sonnet 5 (×1) | 1 | 5 | 1.25 | 0.1 |
| Opus 5.5 (×2) | 2 | 10 | 2.5 | 0.1 |
 
So output is the expensive part, and the model re-reading its own context every turn is the sneaky part. I'm using charged units as one way to compare the two harnesses. It's not the whole story.
 
## Run 1: the build
 
Same prompt, so this is the cleanest comparison.
 
| | Claude CLI | Opencode |
|---|---|---|
| Requests | 38 | 30 |
| Charged | 943,292 | **445,912** |
| Raw output tokens | 40,759 | 18,032 |
| Sonnet helper calls | 9 (203k, 21% of the bill) | 1 (2.4k) |
| Requests that started with a cold cache | 5 (~215k) | 3 (34k) |
| Build result | Passed | Failed once (a missing icon export), then passed |
| Tested in a browser? | No | No |
 
His harness did it for **about half the price**. Roughly 40% of that gap was my harness making extra Sonnet calls (my guess is the permission classifier, I haven't confirmed that). Another 42% was output volume: my run wrote about 2.2× as many Opus output tokens for an app of about the same size.
 
Both runs ended the same way: build passes, and a note admitting that nobody has actually opened it in a browser.
 
<figure class="img-frame">
  <img src="../img/harness-requests.png" alt="Request history from the provider for both runs of Run 1">
  <figcaption>Fig 1. The first 15 requests of my Run 1. The Sonnet rows are the helper calls, and the amber "0 / ..." rows are cold-cache requests that cost 7k to 62k each.</figcaption>
</figure>
 
## Run 2: the redesign
 
This is where it got more interesting, because the costs came out nearly **equal**, but the money went to completely different places.
 
| | Claude CLI | Opencode |
|---|---|---|
| Requests | 57 | 55 |
| Charged | 1,449,718 | 1,515,627 |
| Raw output tokens | 35,979 | 46,201 |
| Sonnet helper calls | 13 (308k, 21%) | 0 |
| Average context per request | ~104k | ~110k |
 
And the phases:
 
| Phase | Claude CLI | Opencode |
|---|---|---|
| Plan / proposal | none | 50k (3%) |
| Writing the files | 572k (39%) | 784k (52%) |
| Checking the work | 878k (61%) | 681k (45%) |
 
His harness asked for approval first, and he replied "don't be too ambitious". Mine just went. His writing phase was bigger because it wrote a plan doc, a test file, two extra components and a 20k-token stylesheet. Mine spent most of its money afterwards, on checking.
 
**The part that stood out:** both of us spent about **half or more of Run 2 after the code already existed**. Every single turn re-reads 100k+ of context, so even a tiny "run this check" costs around 22-25k charged. Checking is expensive no matter which harness you use.
 
Combined across both runs: **2.39M charged for me vs 1.96M for him, about 18% less.**
 
## What actually came out
 
Cost is only half of it. Here's what each harness produced in Run 2:
 
| | Claude CLI | Opencode |
|---|---|---|
| Sounds | Rain, ocean, fireplace, night garden (crickets), soft pad, vinyl | Rain, pad, vinyl, ocean, wind, brown noise |
| Presets | Window seat, After hours, Coastline | Rainy window, Night shift, Coastal quiet |
| Direction | A botanical "quiet room": leaf art around the dial, illustrated animated sound tiles | A "midnight studio": orbital dial, six-fader rack, a zen-stones card |
| Palette | Sage green | Violet |
| Checked with | A headless browser run: mobile overflow, all six layers, presets, timer | 4 unit tests (noise + catalog), lint, build, review subagents. No browser run |
| Bugs it caught | A real pause/reset timing bug in the timer | Lint warnings in the timer hook |
| Stylesheet | One giant minified line | Readable, multi-line |
| Smallest text | 5.5px | 4px |
| Visible flaws | Leaf art overlaps the reset and skip buttons, dead space in the sound tiles | A caption clipped at the card edge |
 
<figure class="img-frame">
  <img src="../img/harness-cli.png" alt="Claude CLI result: the botanical quiet room">
  <figcaption>Fig 2. Claude CLI, Run 2: illustrated sound tiles and leaf art around the timer dial.</figcaption>
</figure>
 
<figure class="img-frame">
  <img src="../img/harness-opencode.png" alt="opencode result: the midnight studio">
  <figcaption>Fig 3. Opencode, Run 2: orbital dial, six-fader sound rack and a zen-stones card.</figcaption>
</figure>
 
<p class="edit-note">[Even though both look like slop, I personally like the design Claude ClI was trying to go with with all the leaves and the animations it was creating even though the leaves were clipping over buttons and were not perfect.]</p>
 
## Where the harness showed up
 
**1. Overhead you don't see.** My harness made a lot of small side calls to a second model, about **21% of my total bill** in both runs. His made almost none. Same model doing the actual work but it produced very different tax around it.
 
**2. The process it pushes you into.** Opencode loaded skills that forced a loop of brainstorm, plan, write tests, build, then get a code review. Claude CLI skipped straight to building. Opencode was a bit better in this case but it was because of my friend having installed those skills long before. It gave him a plan doc and tests, the other gave me nothing written down but a real browser check.
 
**3. How it verifies.** This was the biggest difference. His checks were unit tests, lint and review subagents: good at code hygiene, but nothing ever opened the page. Mine drove an actual browser and **found a real bug**. It's a bit funny that the harness with the fancy process missed the thing a five-minute browser test caught.
 
**4. Whether it asks first.** His harness stopped and asked for approval before building. Mine didn't. That one pause let him shrink the scope ("don't be too ambitious") before any money was spent.
 
**5. Readable output.** His Run 2 stylesheet came out as normal, readable CSS and mine as a single minified line. I can't prove this was the harness and not the skills, but it did make his code far easier to review.
 
## Where it didn't show up
 
This part surprised me more. Despite everything above, the two results are weirdly similar:
 
- Both went dark and editorial, with a serif italic accent word in the headline and a lot of wellness-style copy I never asked for.
- Both ignored the "Tailwind utilities" idea and wrote one giant hand-written stylesheet.
- Both settled on **six sounds and three presets** without being told to.
- Both ended with a note saying the audio needs a listening check.
- Both ran out of balance partway through Run 2.
- Both ended up with tiny text (mine down to 5.5px, his down to 4px).
 
That's the model talking. **Taste, structure and the habit of over-designing came from Opus, not from the harness.**
 
## Caveats
 
I don't want to oversell this, so:
 
- **It's one run per harness.** One sample is a story and not a benchmark.
- **The harness is bundled with other stuff.** I can't separate Opencode from its skills, or plan mode from auto mode. They came as a package.
- **Run 2 wasn't perfectly identical.** He had an approval step and told it not to be too ambitious. I didn't.
- **Different scaffolding.** My scaffold command got blocked, so my dependency versions were hand-picked. His ran the real scaffold, got the latest versions, and that's why his first build failed.
- **His number is probably a floor.** He used several review subagents, but his request log shows one single growing conversation, so those calls may be logged somewhere else.

## So, does the harness matter?
 
**Yes, but not for what the model builds. It matters for everything around the building.**
 
The model decides how the thing looks and how it's structured. The harness decides how much you pay in overhead, how much of your budget goes into checking versus writing, how it runs those agents in loop and whether the thing is ever tested in a way that matters.
 
From this one experiment:
 
- If you care about **cost**, look at the helper calls. A harness that quietly spends a fifth of your bill on side calls matters more than which model you picked.
- If you care about **correctness**, pick the setup that actually runs your app. A browser test caught a bug that tests, lint and review didn't.
- If you care about **taste**, change the prompt. Swapping the harness didn't change the look at all.
 
Honestly, I started this expecting the harness to be a footnote. It isn't. It just isn't where I was looking.
 

**So yes workflow, skills and plugins matter more than the harness...**

<p class="edit-note">[And yes, I'm now annoyed that his build was half the price for the exact same prompt.]</p>
 
## Try it
 
Everything is in one repo: both sets of apps, every request as a CSV, the exact prompts, and a script that rebuilds the numbers in this post.
 
- The experiment: [github.com/SayanNnd/harness-experiment](https://github.com/SayanNnd/harness-experiment)
- The raw request data: `data/` in that repo, and `python3 data/analyze.py` to reproduce every table above
- The exact prompts: `prompts/` in that repo
 
Special Thanks to [myyra0](https://github.com/myyra0) for helping me out with the Opencode build.

If you run the same two prompts on your own setup, I'd genuinely like to hear how yours turns out.
 
***In dark times, should the stars also go out?***

<figure class="img-frame"> <img src="../img/disco.png" alt="disco"> </figure>
