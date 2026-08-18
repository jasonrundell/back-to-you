# Can the voice packs ship inside an npm tarball?

Research for [issue #24](https://github.com/jasonrundell/back-to-you/issues/24), part of the
map [#23](https://github.com/jasonrundell/back-to-you/issues/23). Feeds the naming ticket
[#29](https://github.com/jasonrundell/back-to-you/issues/29) and the Node port.

**Scope:** the mp3s under `sounds/` — four voice packs, ~1.0 MB — and whether they can be
included in the tarball that `npm publish` uploads for a package installable as
`npx backtoyou`. `LICENSE-AUDIO` governs those files: non-commercial only, ElevenLabs
attribution preserved, no AI training, no competing use, no relicensing under more
permissive terms.

**Sources:** npm's Open-Source Terms and CLI documentation, npm's own `npm-packlist` and
`validate-npm-package-license` source, ElevenLabs' Terms of Service, Prohibited Use Policy
and Help Center, and GitHub's Terms of Service. Registry facts are read from the live
registry API, not from write-ups. One claim is settled by running `npm pack --dry-run`
against a fixture rather than by reading documentation.

**Date of research:** 2026-08-18. ElevenLabs' Prohibited Use Policy is stamped
**17 August 2026** — it changed the day before this was written, so section 7 re-reads it
from scratch rather than trusting [`research/elevenlabs-audio-licensing.md`](https://github.com/jasonrundell/back-to-you/blob/research/elevenlabs-audio-licensing/research/elevenlabs-audio-licensing.md).

**Not legal advice.** This is a documentation review.

---

## TL;DR

**Verdict: yes, with conditions.** The audio can ship inside the published tarball. The
fallback on the map's fog — code-only package, CLI fetches packs from the GitHub release —
is **not needed**, and section 9 argues it would make the licensing position slightly
*worse*, not better.

1. **npm does not require an open-source licence.** Its terms say the opposite in as many
   words: *"Your Content belongs to you. You decide whether and how to license it."*
   Proprietary packages are routine — `@mui/x-data-grid-pro` ships today with
   `"license": "SEE LICENSE IN LICENSE"`. (§1)
2. **Publishing a free package on a free registry is not commercial use.** No sale, no paid
   product, no monetised distribution. npm Open Source carries no charge and npm's own terms
   forbid advertising in `README` and `package.json`. (§2)
3. **Accepting npm's terms is not relicensing.** The grant runs *to npm*, covers only
   copy / publish / analyze, terminates when the last copy leaves npm's systems, and npm
   expressly disclaims any ownership. It sits alongside `LICENSE-AUDIO`; it does not replace
   the terms end users receive. (§3)
4. **The attribution requirement does NOT reach the package name.** It is satisfied by the
   rendered README — whose H1 already reads *"Back to You — voices by elevenlabs.io"* — plus
   the `description` field. Putting `elevenlabs` in the *package name* would be worse
   compliance, not better: npm's naming guidance tells you not to use someone else's
   trademark and not to confuse others about authorship. **Ticket #29 is unblocked; the name
   is free.** (§4)
5. **`package.json` gets `"license": "SEE LICENSE IN LICENSE"`.** Not `MIT`, which would be a
   false statement about the tarball's contents and arguably the §9(n) breach itself. Not a
   `LicenseRef` expression — npm's own validator rejects those outright. (§5)
6. **The one thing that will actually break, and it is a packaging bug rather than a legal
   one:** `LICENSE-AUDIO` and `NOTICE` are **not** auto-included in the tarball. `LICENSE`
   and `README.md` are. Proven by running `npm pack`. If a `files` array is used — and it
   will be — both must be listed explicitly, or the package ships restricted audio with the
   restrictions stripped off. (§6)
7. **Nothing at ElevenLabs has moved against this**, despite a PUP update dated yesterday.
   (§7)

---

## 1. Does npm require published packages to be open source?

**No.** The npm Open-Source Terms (last updated March 10, 2022) say so directly, under
"Your Content":

> Your Content belongs to you. You decide whether and how to license it. But at a minimum,
> you license npm to provide Your Content to users of npm Services when you share Your
> Content.

— [npm Open-Source Terms, "Your Content"](https://docs.npmjs.com/policies/open-source-terms)

And the "Commercial Content" section explicitly welcomes non-hobby, non-open work:

> The npm Public Registry is about Packages. All manner of useful Packages are welcome, from
> hobby projects to competitive products, enterprise infrastructure and tooling to the latest
> fun hack or work of software art.
>
> […] You are free to use npm Open Source for commercial projects, to advance your career,
> and for other business purposes.

— [npm Open-Source Terms, "Commercial Content"](https://docs.npmjs.com/policies/open-source-terms)

The word "open source" in the title of the document names the *tier of npm service* (free,
public registry) as against Paid Services, not a licensing requirement on the payload.

**Live precedent.** `@mui/x-data-grid-pro` is a commercially-licensed, non-OSI package on the
public registry. Its published metadata, read from the registry API:

```
$ curl -s https://registry.npmjs.org/@mui/x-data-grid-pro/latest
name    @mui/x-data-grid-pro
license SEE LICENSE IN LICENSE
```

The string round-trips through the registry verbatim. This is a settled, ordinary pattern.

### The one Acceptable Content bullet that does bite

npm's "Acceptable Content" list has a rule that is worth reading carefully, because it is
the only one in the whole policy set that touches audio payloads:

> Packages that are not functionally compatible with the npm command-line client. For
> example, a "package" cannot simply be a PNG or JPEG image, a movie file, or a text document
> uploaded directly to the registry. Using the Public Registry as a general purpose database
> is not allowed.

— [npm Open-Source Terms, "Acceptable Content"](https://docs.npmjs.com/policies/open-source-terms)

`backtoyou` is a real CLI with a `bin` entry that installs hooks and wires `settings.json`.
The mp3s are assets of a functional package, which is exactly what the rule contemplates as
acceptable. **The rule would bite if anyone later split the packs out into a separate
audio-only package** — a `backtoyou-voices` containing nothing but mp3s and a `package.json`
is much closer to "a package cannot simply be… a movie file". Record that as a constraint on
any future packaging split.

The other bullet worth noting is this one, because it is the hook by which an ElevenLabs
breach would become an *npm* breach too:

> Content in violation of law, infringing the intellectual property rights of others,
> violating the privacy or other rights of others, **or in violation of any agreement with a
> third party**.

— [npm Open-Source Terms, "Acceptable Content"](https://docs.npmjs.com/policies/open-source-terms) (emphasis added)

So the ElevenLabs analysis is not merely a private matter between this project and
ElevenLabs. Getting it right is a condition of npm's own content policy. That raises the
stakes on §6's packaging checklist rather than changing the answer.

Checked and irrelevant: the [Dual Use Content policy](https://docs.npmjs.com/policies/dual-use)
covers security-relevant tooling that resembles malware to scanners; it says nothing about
licensing of package contents.

---

## 2. Is publishing to a free public registry a commercial use?

**No.** Three documents converge on this and none of them turns on who owns the registry.

**What ElevenLabs restricts.** The Terms of Service, §1(c):

> (i) if you access or use our Services free of charge (such a user, a "Free User"), you may
> only use the Services for non-commercial purposes; (ii) if you access or use our Services
> through a paid subscription plan (such a user, a "Paid User"), you may use the Services for
> commercial purposes, but in either case, your access and use of the Services and any Output
> must still comply with the Prohibited Use Policy.

— [ElevenLabs Terms of Service §1(c)](https://elevenlabs.io/terms-of-use) (Last Updated 31 March 2026)

reinforced by [PUP §9(a)](https://elevenlabs.io/use-policy) — *"If you are a free user, using
our Services for any commercial purpose, including for advertising or running pyramid
schemes, contests, or sweepstakes"* — and by the Help Center: *"Content created outside of a
paid subscription (before or after) cannot be used commercially and always requires
attribution when shared non-commercially."*

**This constraint is live, not hypothetical.** `LICENSE-AUDIO`'s provenance block records
`Plan at generation  Free tier`. The blocking unknown flagged in the July research has since
been answered, and answered the restrictive way. Everything below assumes free-tier terms
apply permanently to these files.

**What "commercial" means, per this repo's own licence.** `LICENSE-AUDIO` condition 1
enumerates it:

> selling it, bundling it with anything sold, using it in a paid product or service, or
> monetizing distribution of it — for example through sponsorship or affiliate revenue
> attached to the audio.

Publishing `backtoyou` to the public registry does none of those. There is no price, no paid
tier, no gated feature, no ad. npm's own terms confirm the registry side costs nothing:

> There is no charge for use of npm Open Source.

— [npm Open-Source Terms, "Payment Terms"](https://docs.npmjs.com/policies/open-source-terms)

**The "but npm is owned by a commercial company" objection fails**, for the reason the ticket
itself hints at. The test in every ElevenLabs document is *your* use, not your host's business
model. If registry ownership were the test, the repo could not sit on GitHub either — same
owner, same argument — and the release zip already distributed from GitHub Releases would be
equally infected. There is no reading of "using our Services for any commercial purpose" on
which choosing a commercially-operated free host converts a free giveaway into a sale.

npm actually cuts *against* the commercial reading. Its Commercial Content rules forbid
exactly the monetisation vectors `LICENSE-AUDIO` condition 1 names:

> These kinds of commercial content generally aren't acceptable:
>
> - `README`, `package.json`, or other content displaying advertisements.
> - Packages that display ads at runtime, on installation, or at other stages of the software
>   development lifecycle, such as via npm `scripts`.

— [npm Open-Source Terms, "Commercial Content"](https://docs.npmjs.com/policies/open-source-terms)

### Trip-wires to keep clear

These are the things that would *make* it commercial later. None exist today; all are easy to
add by accident.

- **`funding` in `package.json`.** npm expressly permits it — *"Information on how to pay,
  donate to, and otherwise support Package development"* is listed as acceptable commercial
  content, and `npm fund` surfaces it. But `LICENSE-AUDIO` condition 1 names "sponsorship…
  attached to the audio" as monetisation. A GitHub Sponsors link on a package whose payload is
  free-tier ElevenLabs audio is a defensible-but-arguable position. **Recommendation: omit
  `funding` from the initial publish.** It costs nothing to leave out and removes the only
  genuinely grey call in the whole package.
- **A paid tier of the tool** — a `backtoyou-pro`, a paid pack, a license key. Off the table
  while the audio is free-tier ElevenLabs output.
- **Bundling the packs into anything sold**, including a paid course, template, or product
  that vendors `backtoyou` as a dependency. This is a downstream-user restriction, which is
  why `LICENSE-AUDIO` must travel in the tarball (§6) rather than staying behind in the git
  tree.
- **npm paid org plans.** Not an issue — publishing public packages is free, and paying npm
  for private repositories elsewhere would not touch this package.

---

## 3. Does accepting npm's Terms of Service relicense the audio?

**No.** `LICENSE-AUDIO` condition 5 forbids relicensing the audio *under more permissive
terms* — "including MIT, CC BY, CC BY-SA, or CC0" — and PUP §9(n) forbids making Output
available *to your end users* on terms more permissive than your own. npm's grant is neither
of those things. Here it is in full:

> Nothing in this Agreement gives npm any ownership rights in intellectual property that you
> share with npm Services, such as your Account information or any Packages you share with
> npm Services (Your Content).
>
> […] Your Content belongs to you. You decide whether and how to license it. But at a minimum,
> you license npm to provide Your Content to users of npm Services when you share Your
> Content. That special license allows npm to copy, publish, and analyze Your Content, and to
> share its analyses with others. npm may run computer code in Your Content to analyze it, but
> npm's special license alone does not give npm the right to run code for its functionality in
> npm products or services.
>
> When Your Content is removed from npm Services, whether by you or npm, npm's special license
> ends when the last copy disappears from npm's backups, caches, and other systems. Other
> licenses, such as open source licenses, may continue after Your Content is removed.

— [npm Open-Source Terms, "Your Content"](https://docs.npmjs.com/policies/open-source-terms)

Five features of that grant, each of which independently distinguishes it from relicensing:

1. **It runs to npm, not to end users.** Condition 5 and §9(n) both govern the terms
   *recipients* get. Recipients get `LICENSE-AUDIO`, unchanged, provided it is in the tarball.
2. **Its scope is hosting, not use.** Copy, publish, analyze. `LICENSE-AUDIO` already permits
   copying and redistribution outright — *"Copy and redistribute them"* is the second bullet
   under WHAT YOU MAY DO. npm is exercising a permission the licence already grants everyone.
3. **It is expressly non-ownership.** *"Nothing in this Agreement gives npm any ownership
   rights."*
4. **It terminates.** An unpublish ends it once caches drain. A licence grant that expires
   when you withdraw the file is a distribution arrangement, not a relicense.
5. **npm says the licensing decision remains yours** — *"You decide whether and how to license
   it"* — and warns that the terms you chose are the ones that bind: *"Others who receive Your
   Content via npm Services may violate the terms on which you license Your Content."*

### The one genuine tension, stated honestly

The grant includes *"analyze Your Content, and to share its analyses with others"*, and PUP
§9(k)/(l) prohibit using Output as ML input or as part of a training dataset. A maximalist
reading of "analyze" could be made to touch machine learning.

It does not survive contact with the rest of the clause. npm scopes what it means in the very
next sentence — *"npm may run computer code in Your Content to analyze it"* — which is package
and security analysis of code, and it explicitly withholds the broader right to run that code
functionally. There is no AI or model-training language anywhere in the document. And §9(k)/(l)
prohibit **your** use of Output for ML; nothing in publishing to npm is you doing that.

**The decisive comparison is the one the ticket asks for.** GitHub's Terms of Service — which
this repo has already accepted, and under which the mp3s have already been public for months —
carries a grant that is *dramatically* broader:

> You grant GitHub and our Affiliates the right to store, host, archive, parse, display, and
> make copies of Your Content as necessary to provide, develop, and improve the Service,
> **including by training AI Features, and for the purpose of training, developing, and
> improving artificial intelligence and machine learning models and technologies of our
> Affiliates.** […] For the avoidance of doubt, use of Your Content to develop, train, and
> improve artificial intelligence and machine learning models and technologies of GitHub and
> our Affiliates is within the scope of this license and does not constitute a sale or other
> restricted transfer of Your Content.

— [GitHub Terms of Service §D.4, "License Grant to Us"](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)
(Effective date: April 27, 2026, emphasis added)

npm's grant says "copy, publish, and analyze". GitHub's says the quiet part out loud and names
model training. **Publishing to npm is a strictly narrower grant than the one this project is
already living under.** Whatever residual exposure exists on the ML-training axis, it was
incurred at `git push`, not at `npm publish`, and npm adds nothing new to it.

The mitigation for the residual tension is free and is required anyway: ship `LICENSE-AUDIO`
inside the tarball so the restrictions travel with the bytes. That is what §9(n) compliance
looks like in practice, and §6 makes it concrete.

---

## 4. How far does "elevenlabs.io in the title" reach?

**This is the question ticket #29 is waiting on, so the answer is stated flatly: the
attribution requirement does not reach the package name. `backtoyou` is fine.**

### What the requirement actually says

The obligation lives in ElevenLabs' Help Center, not the Terms of Service — a full-text read of
the ToS still turns up no instance of "attribution" or "attribute". The Help Center article was
last updated **2026-08-11**, a week before this research, and reads:

> The free plan does not include a commercial license and cannot be used for any commercial
> purpose. If you publish content generated using our Services on a free plan or without being
> signed-in to your account, you must attribute it to ElevenLabs by including "elevenlabs.io"
> or "11.ai" **in the title** […]
>
> […] Content created outside of a paid subscription (before or after) cannot be used
> commercially and always requires attribution when shared non-commercially.

— [Can I publish the content I generate on the platform?](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform)
(updated 2026-08-11, emphasis added)

Note what it attaches to: *"content generated using our Services"* — the audio, and the work in
which the audio is published. It says "title". It does not say "identifier", "package name",
"module specifier", or "URL slug".

### Why the package name is the wrong place for it

An npm package name is not a title. It is a registry identifier with a naming grammar that
titles do not have — no uppercase, no spaces, URL-safe, globally unique — and npm's own guidance
adds two rules that point directly away from stuffing a vendor's mark into it:

> When choosing a name for your package, choose a name that: […] Meets npm policy guidelines.
> For example, do not give your package an offensive name, and **do not use someone else's
> trademarked name** or violate the npm trademark policy. […]
>
> Additionally, when choosing a name for an unscoped package, choose a name that: Is not spelled
> in a similar way to another package name. **Will not confuse others about authorship.**

— [npm Package name guidelines](https://docs.npmjs.com/package-name-guidelines) (emphasis added)

A package named `backtoyou-elevenlabs` would use ElevenLabs' trademark in the identifier and
imply ElevenLabs authored or endorsed the package. That is a worse outcome on both npm's rules
and on any sensible reading of ElevenLabs' interest — the attribution requirement exists to
credit them, not to imply they shipped a Claude Code hook. Compliance and the naming guidance
point the same way here, which is a good sign the reading is right.

### What npm actually surfaces, and where the attribution goes

Two surfaces carry human-readable text about a package, and npm documents both:

- **The README.** *"Just like in any GitHub repository, the README.md file will be rendered on
  the package's page. On npmjs.com, the README.md is rendered as GitHub Flavored Markdown via
  GitHub's API."*
  — [About package README files](https://docs.npmjs.com/about-package-readme-files)
- **The `description` field.** *"Put a description in it. It's a string. This helps people
  discover your package, as it's listed in npm search."*
  — [package.json docs, `description`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)

The README's H1 is already exactly right:

```
# Back to You — voices by elevenlabs.io
```

That is the title of the work, in the position a title occupies, on the page npm renders. It
satisfies the requirement on its own reading.

**Recommendation: also put it in `description`, as belt and braces.** The `description` is the
only human text that travels to surfaces where the README is not rendered — `npm search`,
`npm view`, dependency listings, third-party registry mirrors. It costs one line and it means
no surface of the published package shows the work's identity without the credit attached:

```json
"description": "A voice for Claude Code — voices by elevenlabs.io"
```

With those two in place, the credit is present in the title of the rendered work and in every
metadata view of it. The name stays free.

### Two README gotchas that follow from this

Because the README is now load-bearing for compliance, not just for marketing:

1. **The attribution must be text, not the banner image.** The repo README's banner is
   `assets/banner-light.svg`, a relative path. Relative asset paths do not resolve on
   npmjs.com — the image will be broken there unless rewritten to an absolute
   `raw.githubusercontent.com` URL. The H1 is plain text and renders fine, so the attribution
   survives; but if anyone ever "simplifies" the H1 down to *"Back to You"* and leans on the
   banner alt text, the credit disappears on npm. Keep the words in the H1.
2. **The README on npm only updates on publish.** *"The README.md file will only be updated on
   the package page when you publish a new version of your package."*
   ([npm docs](https://docs.npmjs.com/about-package-readme-files)) A README fix pushed to
   `main` does not reach npm. If the attribution ever needs correcting there, it needs a
   version bump.

---

## 5. What goes in `package.json`'s `license` field

**`"license": "SEE LICENSE IN LICENSE"`.**

npm documents this form for exactly this case:

> If you are using a license that hasn't been assigned an SPDX identifier, or if you are using
> a custom license, use a string value like this one:
>
> ```json
> { "license": "SEE LICENSE IN <filename>" }
> ```
>
> Then include a file named `<filename>` at the top level of the package.

— [package.json docs, `license`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)

Point it at `LICENSE`, not at `LICENSE-AUDIO`. `LICENSE` is already written as the index for
the split — it opens *"This repository is covered by TWO licenses"* and routes the reader to
`LICENSE-AUDIO` for `sounds/`. It is also the file npm auto-includes in every tarball (§6), so
the pointer can never dangle.

### Why not the alternatives

- **`"MIT"`** — wrong, and not merely imprecise. It is a public statement that the whole tarball
  is MIT when a megabyte of it is not, it is the exact grant `LICENSE-AUDIO` condition 5 forbids,
  and it is arguably the §9(n) breach itself: granting end users terms more permissive than your
  own is complete at the moment of publication, whether or not anyone acts on it. Every automated
  licence scanner in every downstream CI pipeline would read `MIT` and clear the audio for
  commercial use.
- **`"(MIT AND LicenseRef-BackToYou-Audio)"`** — the intuitively correct SPDX expression, and
  **npm rejects it**. The validator npm uses says so in its own error string:

  > `license should be a valid SPDX license expression (without "LicenseRef"), "UNLICENSED", or "SEE LICENSE IN <filename>"`

  and returns `validForNewPackages: false` for any expression containing `LicenseRef` or
  `DocumentRef`.
  — [`validate-npm-package-license` source](https://github.com/kemitchell/validate-npm-package-license.js/blob/master/index.js)

  The same source confirms `SEE LICENSE IN <filename>` returns `validForNewPackages: true`.
  (Note: the npm CLI does not *hard fail* on a bad `license` string at `npm pack` or
  `npm publish` time — verified locally with npm 10.9.7. The warning surfaces downstream via
  `normalize-package-data`. So "it published without complaining" proves nothing; the source is
  the authority.)
- **`"UNLICENSED"`** — wrong in the other direction. npm defines it as *"if you do not wish to
  grant others the right to use a private or unpublished package under any terms"*, and pairs it
  with `"private": true`. The code here is deliberately MIT and the audio is deliberately
  redistributable.

**Consequence for the SPDX gap.** `SEE LICENSE IN LICENSE` is opaque to machine readers — no
scanner can infer "MIT code plus non-commercial audio" from it. That is unavoidable given npm's
`LicenseRef` ban, and it is the correct failure mode: an honest "read the file" beats a
machine-readable lie. It does mean the human-readable files have to carry the whole load, which
is the next section.

---

## 6. The packaging mechanics that will actually bite

This is the finding most likely to cause a real-world breach, and it is not a legal question at
all.

npm's documentation lists what is always included in a tarball:

> Certain files are always included, regardless of settings:
> `package.json`, `README`, `LICENSE` / `LICENCE`, the file in the "main" field, the file(s) in
> the "bin" field. […] README & LICENSE can have any case and extension.

— [package.json docs, `files`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)

**"Any case and extension" does not cover `LICENSE-AUDIO`.** `npm-packlist` implements the rule
as a glob, and `-AUDIO` is a suffix, not an extension:

```js
'!/readme{,.*[^~$]}',
'!/copying{,.*[^~$]}',
'!/license{,.*[^~$]}',
'!/licence{,.*[^~$]}',
```

— [`npm/npm-packlist`, `lib/index.js`](https://github.com/npm/npm-packlist/blob/main/lib/index.js)

`NOTICE` is not on the list at all.

### Proof, not inference

A fixture mirroring the intended package shape — `files: ["sounds/", "hooks/"]`, plus
`LICENSE`, `LICENSE-AUDIO`, `NOTICE`, `README.md` at the root:

```
$ npm pack --dry-run
npm notice Tarball Contents
npm notice 4B   LICENSE
npm notice 7B   README.md
npm notice 2B   cli.js
npm notice 129B package.json
npm notice 4B   sounds/claude/task-complete/a.mp3
npm notice total files: 5
```

`LICENSE-AUDIO` and `NOTICE` are **silently absent**. The mp3s ship; the terms that govern them
do not. That package would be a live breach of `LICENSE-AUDIO` condition 5 ("if you redistribute
the audio… these same conditions must travel with it") and of PUP §9(n), and it would fail npm's
own "in violation of any agreement with a third party" content rule (§1). Nothing warns you.

Adding both to `files` fixes it, also verified:

```
$ npm pack --dry-run     # files: ["sounds/", "hooks/", "LICENSE-AUDIO", "NOTICE"]
npm notice 4B   LICENSE
npm notice 6B   LICENSE-AUDIO
npm notice 7B   NOTICE
npm notice 7B   README.md
...
```

### The shape to publish

```json
{
  "name": "backtoyou",
  "description": "A voice for Claude Code — voices by elevenlabs.io",
  "license": "SEE LICENSE IN LICENSE",
  "files": [
    "bin/",
    "lib/",
    "hooks/",
    "sounds/",
    "LICENSE",
    "LICENSE-AUDIO",
    "NOTICE"
  ]
}
```

`LICENSE` and `README.md` are redundant in `files` but harmless, and listing `LICENSE`
explicitly documents intent next to `LICENSE-AUDIO`.

### Compliance checklist for the publish ticket

- [ ] `license` is `"SEE LICENSE IN LICENSE"`.
- [ ] `description` contains `elevenlabs.io`.
- [ ] README H1 still contains `elevenlabs.io` as **text**.
- [ ] README's License section — already written, at `README.md:209` — survives into the
      published README, including the "not open source / non-commercial" wording.
- [ ] `LICENSE`, `LICENSE-AUDIO`, and `NOTICE` are all listed in `files`.
- [ ] `npm pack --dry-run` output is eyeballed and all three appear. **Make this a test.** This
      is the check that stops the breach, and it is one grep over `npm pack --dry-run` output.
- [ ] No `funding` field (§2).
- [ ] No install-time or runtime advertising, per npm's Commercial Content rules and
      `LICENSE-AUDIO` condition 1.
- [ ] README image paths rewritten to absolute URLs, or accepted as broken on npmjs.com (§4).

---

## 7. Has anything at ElevenLabs moved since the July 2026 generation date?

**Re-read from source on 2026-08-18, because the PUP changed the previous day.**

| Document | Stamp | Relevant to this question? |
| --- | --- | --- |
| [Prohibited Use Policy](https://elevenlabs.io/use-policy) | Last Updated **17 August 2026** | Clauses §9(a), (b), (c), (j), (k), (l), (n) are **materially unchanged** from the versions quoted in the July research. |
| [Terms of Service](https://elevenlabs.io/terms-of-use) | Last Updated **31 March 2026** | §1(c), §4(a), §4(c)(ii) unchanged. Still no attribution clause anywhere in the ToS. |
| [Help Center — publishing content](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform) | Updated **2026-08-11** | Attribution language unchanged: `"elevenlabs.io"` or `"11.ai"` **in the title**, free plan non-commercial. |

The 17 August PUP revision adds clauses that do not touch this project: §9(m) (EU AI Act
classification), §9(o) (Government Entities), §9(p) (metatags/hidden text using ElevenLabs'
marks), §9(q) (framing/mirroring the Services), §9(r) (under-13 users), §9(s) (soliciting
ElevenLabs staff), §9(t) (gaming free plans and Voice Library rewards). §9(p) is worth one
glance since it mentions their marks — it prohibits *hidden* text and metatags using the
ElevenLabs name, which is the opposite of what §4 recommends: visible, honest credit in a
rendered heading.

Critically, **§9(c) is still scoped to the Sound Effects product only** — *"any Output […]
generated using our Sound Effects product on a standalone basis […] including as isolated
files, audio samples, music or sound, libraries, or other collections of sounds."* These packs
are Text to Speech, so the one clause in the entire policy that bans shipping a collection of
audio files still does not reach them. **This remains the load-bearing distinction for the whole
project, and it is one product-name swap away from collapsing.** If anyone ever generates a clip
with ElevenLabs' Sound Effects tool and drops it into `sounds/`, the npm package becomes
unpublishable and no licensing manoeuvre fixes it.

The re-check cadence that follows: read the PUP's Last Updated stamp before each `npm publish`
of a release that adds or regenerates audio. It moved twice in eleven months.

---

## 8. Verdict

**Yes — the voice packs can ship inside the published npm tarball — conditional on the §6
checklist.**

The three conditions the ticket raised, answered in order:

1. **Non-commercial.** Publishing free to a free registry is not a commercial use. The
   registry operator's business model is not the publisher's use, and if it were, GitHub
   hosting would already have breached it. Keep `funding`, ads, and paid tiers off the package.
2. **Attribution.** Satisfied by the rendered README H1 (`Back to You — voices by
   elevenlabs.io`) plus the `description` field. **It does not reach the package name.** #29 is
   unblocked and free to pick on other grounds.
3. **No relicensing.** npm's terms grant npm a narrow, terminating, hosting-scoped licence to
   copy, publish and analyze, while stating explicitly that the licence to users remains yours.
   It sits alongside `LICENSE-AUDIO`. It is a *narrower* grant than GitHub's, which this project
   already accepted.

The real risk in this ticket is not any of the three. It is that `LICENSE-AUDIO` and `NOTICE`
fall out of the tarball unnoticed, and the audio ships stripped of the terms that make shipping
it lawful. Make the `npm pack --dry-run` assertion a test.

---

## 9. What this means for the fallback

The map's fog sketches a fallback: package ships code only, CLI fetches packs from the GitHub
release at install time. **It is not needed, and it is not a licensing improvement.**

- The bytes stay on GitHub either way, under a grant that expressly covers AI model training
  (§3). Moving them *off* npm does not shrink the total grant; it just removes the narrower of
  the two.
- It makes attribution *harder*. In the tarball, `LICENSE-AUDIO` sits beside the mp3s and lands
  on disk beside them. In a download-at-install design, the terms and the audio arrive by
  different routes and only one of them is versioned with the package.
- It adds a network dependency to `npx backtoyou`, which is the single thing the map's
  destination promises will just work on three platforms.
- The payload is 1.1 MB. There is no size argument to weigh against any of this.

If the fallback is ever revived, revive it for a technical reason — not this one. And note §1's
warning: an audio-only npm package would run into npm's "a package cannot simply be… a movie
file" rule, so "publish the packs as a separate npm package" is the one variant of the fallback
that is genuinely worse on npm's own terms.

---

## 10. Open questions

Stated rather than guessed.

- **ElevenLabs does not define "title" for a software package.** Section 4's reading — that a
  registry identifier is not a title and a rendered H1 is — is a judgement call, not a quoted
  rule, because no ElevenLabs document contemplates npm. It is argued from what the word means,
  from what npm's own docs say each field is for, and from npm's naming guidance pointing away
  from trademark use. The belt-and-braces `description` recommendation exists precisely so that
  a stricter reader still finds the credit on every surface. Only ElevenLabs can settle it
  definitively, via their contact form, if it is ever worth asking.
- **Whether npm ever exercises its "analyze" right on non-code binaries** is not knowable from
  the documents. The clause's own next sentence scopes it to running code, and the mitigation
  (ship `LICENSE-AUDIO`) is required anyway.
- **`funding`.** §2 recommends omitting it, but a reasoned argument exists that sponsoring
  *code* development is not "monetizing distribution of the audio". Recorded as a live decision
  rather than a settled one, in case the project later wants it badly enough to argue the point.
