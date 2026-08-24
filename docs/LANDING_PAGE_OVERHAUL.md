# Landing Page Overhaul — Context & Preferences

**Status:** collecting context (not yet a sprint, not yet a plan).
**Scope:** `ozark-open.com` root route only — the logged-out marketing page at
[`app/page.tsx`](../app/page.tsx). Everything behind login is out of scope
unless a context item below says otherwise.

This file is the running record of what Andrew wants the overhaul to be. It is
written **incrementally, one context item at a time**, in the order the items
arrive. When the collection phase ends, this doc — plus
`docs/DESIGN_SYSTEM.md` and the `ozark-open-design` skill — is the brief the
implementation works from. Nothing here is built until the brief is closed.

---

## 1. What exists today

`app/page.tsx` is a **server component**. It calls `supabase.auth.getUser()`
and `redirect("/dashboard")` for authenticated members, so the landing page is
only ever seen logged-out. It renders, in a single 640px column:

1. `/ozark-mark.svg` (112px), the `Ozark Open Sportsbook` H1 in `font-heading`
   indigo-700, a two-sentence subhead, and the "No house, no rake, no profit."
   line.
2. One gold CTA — `Log in to place your bets` → `/login` — as a plain `<Link>`
   styled by `buttonVariants`, deliberately **zero client JS**.
3. Three `Card size="sm"` blocks: *Everyone's in the pool* (pari-mutuel),
   *Bet the tournament* (Sept 24–26, 2026), *Strictly clubhouse* (invite only).
4. A `Private pool · invite only · Ozark Open 2026` footer line.

Constraints it currently satisfies that any overhaul has to consciously keep or
consciously break: no client JS on the critical path, one gold CTA per screen
(the DS rations gold), single light theme (dark mode is intentionally dropped),
and the auth redirect.

## 2. Stack facts the overhaul must design around

| Fact | Consequence |
|---|---|
| Next.js 16.2 App Router, React 19.2, RSC on | Any scroll-driven hero is a `'use client'` island; the page shell (and the auth redirect) should stay server-side. |
| Tailwind v4, tokens in `app/globals.css` via `@theme inline` | No hardcoded hexes and no raw `blue-200`-style utilities from copy-pasted components — port to DS tokens (`text-on-dark`, `indigo-*`, `gold-*`, `ink-*`). |
| shadcn style `base-nova`, `aliases.ui = @/components/ui` | `components/ui/` already exists (button, card, dialog, input, badge, …). Third-party blocks drop in there or in a sibling `components/blocks/`. |
| `framer-motion` is **not** installed | Any animation-dependent component needs a dependency decision first — see Open Questions. |
| Single light theme, WCAG AA, tuned for outdoor/sunlight reading | Dark hero imagery is a deliberate exception, not the default; contrast has to be checked, not assumed. |
| ~32 invited participants, invite-only, no SEO/public access | The page persuades people who **already know what this is** and need to log in. It is not customer acquisition. Weigh spectacle against "get me to the login button." |

---

## Context items

### Item 1 — Scroll-expansion hero pattern (21st.dev)

**Source:** <https://21st.dev/@arunachalam/components/scroll-expansion-hero>
**Andrew's framing:** *"I am intrigued by the hero pattern found here."* —
interest in the **pattern**, recorded as a reference, not yet an adopted
decision.

**The pattern:** a full-viewport hero that hijacks the first stretch of scroll.
A background image sits at full bleed; a centered media card (video or image)
starts small (300×400) and grows with scroll progress (to ~1550×800 desktop,
~950×600 mobile) while the background fades out, the title halves slide apart
horizontally (`translateX` ± scroll progress), and the media's dark overlay
lightens. At progress ≥ 1 the media is "fully expanded", page scroll unlocks,
and the `children` content section fades in below. Scrolling back up at
`window.scrollY <= 5` re-locks and reverses it.

**Implementation notes / gotchas for our stack** (assessment, not the author's):

- **Dependency:** the source needs `framer-motion`, which we don't have. The
  current package is `motion` (framer-motion's successor). Adding either is a
  new runtime dependency on a page that currently ships **zero** client JS —
  that trade is the first real decision. The four `motion.div` uses here are
  opacity fades that plain CSS transitions could do.
- **Scroll hijacking:** it attaches non-passive `wheel`/`touchmove` listeners
  to `window` and calls `window.scrollTo(0, 0)` on every scroll until
  expansion completes. That means: no keyboard scrolling (Space/PgDn/arrows
  are not handled), no `prefers-reduced-motion` respect, and a hard block on
  reaching the CTA until the animation is satisfied. All three need an answer
  before this ships on a page whose job is "log in."
- **Path mismatch in the source:** the integration prompt says copy to
  `/components/ui`, but `demo.tsx` imports from
  `@/components/blocks/scroll-expansion-hero`. Pick one; `components/blocks/`
  reads better for a page-level composite than `components/ui/` (which is
  primitives).
- **Styling:** hardcoded `text-blue-200` and `bg-black/10|30|50` throughout —
  every one of those becomes a DS token in a port.
- **Assets:** the pattern wants a background image **and** a foreground
  video/image. We have none for this purpose today (`public/` holds the marks,
  onboarding shots, `celebration/great-job.mp4`, and the joke ads). Sourcing
  real Ozark Open course/tournament media is a prerequisite, not a detail.
- **Layout:** it is `min-h-[100dvh]` and full-bleed, which fights the current
  `max-w-[var(--content-max,640px)]` column and sits under the app header
  (`components/header.tsx` / `site-nav.tsx`) — check how the hero and the
  header coexist.

The full component source and the vendor's integration prompt are preserved
verbatim in [Appendix A](#appendix-a--item-1-source-verbatim) so the reference
survives without the chat thread.

---

## Open questions

Carried forward until answered; each becomes a decision line above.

1. **Adopt or borrow?** Is Item 1 the hero we build, or a mood reference for
   "big, cinematic, scroll-reactive"?
2. **Client JS budget.** Is a ~30–50KB animation dependency acceptable on the
   logged-out page, or should the effect be CSS/`scroll-timeline`-only?
3. **Media.** What actually fills the hero — course photography, tournament
   video, trophy/mark animation? Who supplies it?
4. **Does the CTA still come first?** A scroll-locked hero puts the login
   button below an animation. Acceptable for an invite-only crowd, or not?
5. **Reduced motion / keyboard / mobile fallbacks.** What does the page do for
   someone who can't or won't scroll through it?
6. **Does anything else on the page change** — the three cards, the countdown
   (`components/countdown.tsx`), the footer — or is this hero-only?

---

## Appendix A — Item 1 source, verbatim

Preserved exactly as supplied by 21st.dev's "integrate this component" prompt.
Treat it as reference material to port, not code to paste.

> You are given a task to integrate an existing React component in the codebase
>
> The codebase should support:
> - shadcn project structure
> - Tailwind CSS
> - Typescript
>
> If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.
>
> Determine the default path for components and styles.
> If default path for components is not /components/ui, provide instructions on why it's important to create this folder
> Copy-paste this component to /components/ui folder:

### `scroll-expansion-hero.tsx`

```tsx
'use client';

import {
  useEffect,
  useRef,
  useState,
  ReactNode,
  TouchEvent,
  WheelEvent,
} from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';

interface ScrollExpandMediaProps {
  mediaType?: 'video' | 'image';
  mediaSrc: string;
  posterSrc?: string;
  bgImageSrc: string;
  title?: string;
  date?: string;
  scrollToExpand?: string;
  textBlend?: boolean;
  children?: ReactNode;
}

const ScrollExpandMedia = ({
  mediaType = 'video',
  mediaSrc,
  posterSrc,
  bgImageSrc,
  title,
  date,
  scrollToExpand,
  textBlend,
  children,
}: ScrollExpandMediaProps) => {
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [showContent, setShowContent] = useState<boolean>(false);
  const [mediaFullyExpanded, setMediaFullyExpanded] = useState<boolean>(false);
  const [touchStartY, setTouchStartY] = useState<number>(0);
  const [isMobileState, setIsMobileState] = useState<boolean>(false);

  const sectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setScrollProgress(0);
    setShowContent(false);
    setMediaFullyExpanded(false);
  }, [mediaType]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (mediaFullyExpanded && e.deltaY < 0 && window.scrollY <= 5) {
        setMediaFullyExpanded(false);
        e.preventDefault();
      } else if (!mediaFullyExpanded) {
        e.preventDefault();
        const scrollDelta = e.deltaY * 0.0009;
        const newProgress = Math.min(
          Math.max(scrollProgress + scrollDelta, 0),
          1
        );
        setScrollProgress(newProgress);

        if (newProgress >= 1) {
          setMediaFullyExpanded(true);
          setShowContent(true);
        } else if (newProgress < 0.75) {
          setShowContent(false);
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      setTouchStartY(e.touches[0].clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartY) return;

      const touchY = e.touches[0].clientY;
      const deltaY = touchStartY - touchY;

      if (mediaFullyExpanded && deltaY < -20 && window.scrollY <= 5) {
        setMediaFullyExpanded(false);
        e.preventDefault();
      } else if (!mediaFullyExpanded) {
        e.preventDefault();
        // Increase sensitivity for mobile, especially when scrolling back
        const scrollFactor = deltaY < 0 ? 0.008 : 0.005; // Higher sensitivity for scrolling back
        const scrollDelta = deltaY * scrollFactor;
        const newProgress = Math.min(
          Math.max(scrollProgress + scrollDelta, 0),
          1
        );
        setScrollProgress(newProgress);

        if (newProgress >= 1) {
          setMediaFullyExpanded(true);
          setShowContent(true);
        } else if (newProgress < 0.75) {
          setShowContent(false);
        }

        setTouchStartY(touchY);
      }
    };

    const handleTouchEnd = (): void => {
      setTouchStartY(0);
    };

    const handleScroll = (): void => {
      if (!mediaFullyExpanded) {
        window.scrollTo(0, 0);
      }
    };

    window.addEventListener('wheel', handleWheel as unknown as EventListener, {
      passive: false,
    });
    window.addEventListener('scroll', handleScroll as EventListener);
    window.addEventListener(
      'touchstart',
      handleTouchStart as unknown as EventListener,
      { passive: false }
    );
    window.addEventListener(
      'touchmove',
      handleTouchMove as unknown as EventListener,
      { passive: false }
    );
    window.addEventListener('touchend', handleTouchEnd as EventListener);

    return () => {
      window.removeEventListener(
        'wheel',
        handleWheel as unknown as EventListener
      );
      window.removeEventListener('scroll', handleScroll as EventListener);
      window.removeEventListener(
        'touchstart',
        handleTouchStart as unknown as EventListener
      );
      window.removeEventListener(
        'touchmove',
        handleTouchMove as unknown as EventListener
      );
      window.removeEventListener('touchend', handleTouchEnd as EventListener);
    };
  }, [scrollProgress, mediaFullyExpanded, touchStartY]);

  useEffect(() => {
    const checkIfMobile = (): void => {
      setIsMobileState(window.innerWidth < 768);
    };

    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);

    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  const mediaWidth = 300 + scrollProgress * (isMobileState ? 650 : 1250);
  const mediaHeight = 400 + scrollProgress * (isMobileState ? 200 : 400);
  const textTranslateX = scrollProgress * (isMobileState ? 180 : 150);

  const firstWord = title ? title.split(' ')[0] : '';
  const restOfTitle = title ? title.split(' ').slice(1).join(' ') : '';

  return (
    <div
      ref={sectionRef}
      className='transition-colors duration-700 ease-in-out overflow-x-hidden'
    >
      <section className='relative flex flex-col items-center justify-start min-h-[100dvh]'>
        <div className='relative w-full flex flex-col items-center min-h-[100dvh]'>
          <motion.div
            className='absolute inset-0 z-0 h-full'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 - scrollProgress }}
            transition={{ duration: 0.1 }}
          >
            <Image
              src={bgImageSrc}
              alt='Background'
              width={1920}
              height={1080}
              className='w-screen h-screen'
              style={{
                objectFit: 'cover',
                objectPosition: 'center',
              }}
              priority
            />
            <div className='absolute inset-0 bg-black/10' />
          </motion.div>

          <div className='container mx-auto flex flex-col items-center justify-start relative z-10'>
            <div className='flex flex-col items-center justify-center w-full h-[100dvh] relative'>
              <div
                className='absolute z-0 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-none rounded-2xl'
                style={{
                  width: `${mediaWidth}px`,
                  height: `${mediaHeight}px`,
                  maxWidth: '95vw',
                  maxHeight: '85vh',
                  boxShadow: '0px 0px 50px rgba(0, 0, 0, 0.3)',
                }}
              >
                {mediaType === 'video' ? (
                  mediaSrc.includes('youtube.com') ? (
                    <div className='relative w-full h-full pointer-events-none'>
                      <iframe
                        width='100%'
                        height='100%'
                        src={
                          mediaSrc.includes('embed')
                            ? mediaSrc +
                              (mediaSrc.includes('?') ? '&' : '?') +
                              'autoplay=1&mute=1&loop=1&controls=0&showinfo=0&rel=0&disablekb=1&modestbranding=1'
                            : mediaSrc.replace('watch?v=', 'embed/') +
                              '?autoplay=1&mute=1&loop=1&controls=0&showinfo=0&rel=0&disablekb=1&modestbranding=1&playlist=' +
                              mediaSrc.split('v=')[1]
                        }
                        className='w-full h-full rounded-xl'
                        frameBorder='0'
                        allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
                        allowFullScreen
                      />
                      <div
                        className='absolute inset-0 z-10'
                        style={{ pointerEvents: 'none' }}
                      ></div>

                      <motion.div
                        className='absolute inset-0 bg-black/30 rounded-xl'
                        initial={{ opacity: 0.7 }}
                        animate={{ opacity: 0.5 - scrollProgress * 0.3 }}
                        transition={{ duration: 0.2 }}
                      />
                    </div>
                  ) : (
                    <div className='relative w-full h-full pointer-events-none'>
                      <video
                        src={mediaSrc}
                        poster={posterSrc}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload='auto'
                        className='w-full h-full object-cover rounded-xl'
                        controls={false}
                        disablePictureInPicture
                        disableRemotePlayback
                      />
                      <div
                        className='absolute inset-0 z-10'
                        style={{ pointerEvents: 'none' }}
                      ></div>

                      <motion.div
                        className='absolute inset-0 bg-black/30 rounded-xl'
                        initial={{ opacity: 0.7 }}
                        animate={{ opacity: 0.5 - scrollProgress * 0.3 }}
                        transition={{ duration: 0.2 }}
                      />
                    </div>
                  )
                ) : (
                  <div className='relative w-full h-full'>
                    <Image
                      src={mediaSrc}
                      alt={title || 'Media content'}
                      width={1280}
                      height={720}
                      className='w-full h-full object-cover rounded-xl'
                    />

                    <motion.div
                      className='absolute inset-0 bg-black/50 rounded-xl'
                      initial={{ opacity: 0.7 }}
                      animate={{ opacity: 0.7 - scrollProgress * 0.3 }}
                      transition={{ duration: 0.2 }}
                    />
                  </div>
                )}

                <div className='flex flex-col items-center text-center relative z-10 mt-4 transition-none'>
                  {date && (
                    <p
                      className='text-2xl text-blue-200'
                      style={{ transform: `translateX(-${textTranslateX}vw)` }}
                    >
                      {date}
                    </p>
                  )}
                  {scrollToExpand && (
                    <p
                      className='text-blue-200 font-medium text-center'
                      style={{ transform: `translateX(${textTranslateX}vw)` }}
                    >
                      {scrollToExpand}
                    </p>
                  )}
                </div>
              </div>

              <div
                className={`flex items-center justify-center text-center gap-4 w-full relative z-10 transition-none flex-col ${
                  textBlend ? 'mix-blend-difference' : 'mix-blend-normal'
                }`}
              >
                <motion.h2
                  className='text-4xl md:text-5xl lg:text-6xl font-bold text-blue-200 transition-none'
                  style={{ transform: `translateX(-${textTranslateX}vw)` }}
                >
                  {firstWord}
                </motion.h2>
                <motion.h2
                  className='text-4xl md:text-5xl lg:text-6xl font-bold text-center text-blue-200 transition-none'
                  style={{ transform: `translateX(${textTranslateX}vw)` }}
                >
                  {restOfTitle}
                </motion.h2>
              </div>
            </div>

            <motion.section
              className='flex flex-col w-full px-8 py-10 md:px-16 lg:py-20'
              initial={{ opacity: 0 }}
              animate={{ opacity: showContent ? 1 : 0 }}
              transition={{ duration: 0.7 }}
            >
              {children}
            </motion.section>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ScrollExpandMedia;
```

### `demo.tsx`

```tsx
'use client';

import { useState, useEffect } from 'react';
import ScrollExpandMedia from '@/components/blocks/scroll-expansion-hero';

interface MediaAbout {
  overview: string;
  conclusion: string;
}

interface MediaContent {
  src: string;
  poster?: string;
  background: string;
  title: string;
  date: string;
  scrollToExpand: string;
  about: MediaAbout;
}

interface MediaContentCollection {
  [key: string]: MediaContent;
}

const sampleMediaContent: MediaContentCollection = {
  video: {
    src: 'https://me7aitdbxq.ufs.sh/f/2wsMIGDMQRdYuZ5R8ahEEZ4aQK56LizRdfBSqeDMsmUIrJN1',
    poster:
      'https://images.pexels.com/videos/5752729/space-earth-universe-cosmos-5752729.jpeg',
    background:
      'https://me7aitdbxq.ufs.sh/f/2wsMIGDMQRdYMNjMlBUYHaeYpxduXPVNwf8mnFA61L7rkcoS',
    title: 'Immersive Video Experience',
    date: 'Cosmic Journey',
    scrollToExpand: 'Scroll to Expand Demo',
    about: {
      overview:
        'This is a demonstration of the ScrollExpandMedia component with a video. As you scroll, the video expands to fill more of the screen, creating an immersive experience. This component is perfect for showcasing video content in a modern, interactive way.',
      conclusion:
        'The ScrollExpandMedia component provides a unique way to engage users with your content through interactive scrolling. Try switching between video and image modes to see different implementations.',
    },
  },
  image: {
    src: 'https://images.unsplash.com/photo-1682687982501-1e58ab814714?q=80&w=1280&auto=format&fit=crop',
    background:
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1920&auto=format&fit=crop',
    title: 'Dynamic Image Showcase',
    date: 'Underwater Adventure',
    scrollToExpand: 'Scroll to Expand Demo',
    about: {
      overview:
        'This is a demonstration of the ScrollExpandMedia component with an image. The same smooth expansion effect works beautifully with static images, allowing you to create engaging visual experiences without video content.',
      conclusion:
        'The ScrollExpandMedia component works equally well with images and videos. This flexibility allows you to choose the media type that best suits your content while maintaining the same engaging user experience.',
    },
  },
};

const MediaContent = ({ mediaType }: { mediaType: 'video' | 'image' }) => {
  const currentMedia = sampleMediaContent[mediaType];

  return (
    <div className='max-w-4xl mx-auto'>
      <h2 className='text-3xl font-bold mb-6 text-black dark:text-white'>
        About This Component
      </h2>
      <p className='text-lg mb-8 text-black dark:text-white'>
        {currentMedia.about.overview}
      </p>

      <p className='text-lg mb-8 text-black dark:text-white'>
        {currentMedia.about.conclusion}
      </p>
    </div>
  );
};

export const VideoExpansionTextBlend = () => {
  const mediaType = 'video';
  const currentMedia = sampleMediaContent[mediaType];

  useEffect(() => {
    window.scrollTo(0, 0);

    const resetEvent = new Event('resetSection');
    window.dispatchEvent(resetEvent);
  }, []);

  return (
    <div className='min-h-screen'>
      <ScrollExpandMedia
        mediaType={mediaType}
        mediaSrc={currentMedia.src}
        posterSrc={currentMedia.poster}
        bgImageSrc={currentMedia.background}
        title={currentMedia.title}
        date={currentMedia.date}
        scrollToExpand={currentMedia.scrollToExpand}
        textBlend
      >
        <MediaContent mediaType={mediaType} />
      </ScrollExpandMedia>
    </div>
  );
};

export const ImageExpansionTextBlend = () => {
  const mediaType = 'image';
  const currentMedia = sampleMediaContent[mediaType];

  useEffect(() => {
    window.scrollTo(0, 0);

    const resetEvent = new Event('resetSection');
    window.dispatchEvent(resetEvent);
  }, []);

  return (
    <div className='min-h-screen'>
      <ScrollExpandMedia
        mediaType={mediaType}
        mediaSrc={currentMedia.src}
        bgImageSrc={currentMedia.background}
        title={currentMedia.title}
        date={currentMedia.date}
        scrollToExpand={currentMedia.scrollToExpand}
        textBlend
      >
        <MediaContent mediaType={mediaType} />
      </ScrollExpandMedia>
    </div>
  );
};

export const VideoExpansion = () => {
  const mediaType = 'video';
  const currentMedia = sampleMediaContent[mediaType];

  useEffect(() => {
    window.scrollTo(0, 0);

    const resetEvent = new Event('resetSection');
    window.dispatchEvent(resetEvent);
  }, []);

  return (
    <div className='min-h-screen'>
      <ScrollExpandMedia
        mediaType={mediaType}
        mediaSrc={currentMedia.src}
        posterSrc={currentMedia.poster}
        bgImageSrc={currentMedia.background}
        title={currentMedia.title}
        date={currentMedia.date}
        scrollToExpand={currentMedia.scrollToExpand}
      >
        <MediaContent mediaType={mediaType} />
      </ScrollExpandMedia>
    </div>
  );
};

export const ImageExpansion = () => {
  const mediaType = 'image';
  const currentMedia = sampleMediaContent[mediaType];

  useEffect(() => {
    window.scrollTo(0, 0);

    const resetEvent = new Event('resetSection');
    window.dispatchEvent(resetEvent);
  }, []);

  return (
    <div className='min-h-screen'>
      <ScrollExpandMedia
        mediaType={mediaType}
        mediaSrc={currentMedia.src}
        bgImageSrc={currentMedia.background}
        title={currentMedia.title}
        date={currentMedia.date}
        scrollToExpand={currentMedia.scrollToExpand}
      >
        <MediaContent mediaType={mediaType} />
      </ScrollExpandMedia>
    </div>
  );
};

const Demo = () => {
  const [mediaType, setMediaType] = useState('video');
  const currentMedia = sampleMediaContent[mediaType];

  useEffect(() => {
    window.scrollTo(0, 0);

    const resetEvent = new Event('resetSection');
    window.dispatchEvent(resetEvent);
  }, [mediaType]);

  return (
    <div className='min-h-screen'>
      <div className='fixed top-4 right-4 z-50 flex gap-2'>
        <button
          onClick={() => setMediaType('video')}
          className={`px-4 py-2 rounded-lg ${
            mediaType === 'video'
              ? 'bg-white text-black'
              : 'bg-black/50 text-white border border-white/30'
          }`}
        >
          Video
        </button>

        <button
          onClick={() => setMediaType('image')}
          className={`px-4 py-2 rounded-lg ${
            mediaType === 'image'
              ? 'bg-white text-black'
              : 'bg-black/50 text-white border border-white/30'
          }`}
        >
          Image
        </button>
      </div>

      <ScrollExpandMedia
        mediaType={mediaType as 'video' | 'image'}
        mediaSrc={currentMedia.src}
        posterSrc={mediaType === 'video' ? currentMedia.poster : undefined}
        bgImageSrc={currentMedia.background}
        title={currentMedia.title}
        date={currentMedia.date}
        scrollToExpand={currentMedia.scrollToExpand}
      >
        <MediaContent mediaType={mediaType as 'video' | 'image'} />
      </ScrollExpandMedia>
    </div>
  );
};

export default Demo;
```

### Vendor integration instructions (verbatim)

> Install NPM dependencies:
> ```bash
> framer-motion
> ```
>
> Implementation Guidelines
>  1. Analyze the component structure and identify all required dependencies
>  2. Review the component's argumens and state
>  3. Identify any required context providers or hooks and install them
>  4. Questions to Ask
>  - What data/props will be passed to this component?
>  - Are there any specific state management requirements?
>  - Are there any required assets (images, icons, etc.)?
>  - What is the expected responsive behavior?
>  - What is the best place to use this component in the app?
>
> Steps to integrate
>  0. Copy paste all the code above in the correct directories
>  1. Install external dependencies
>  2. Fill image assets with Unsplash stock images you know exist
>  3. Use lucide-react icons for svgs or logos if component requires them
