"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import Image from "next/image";
import {
  SunRaysIcon,
  FileIcon,
  BellIcon,
  MembersIcon,
  CollectionIcon,
  DocSparkleIcon,
} from "@/components/icons";

export default function Page() {
  const { data: session } = authClient.useSession();

  return (
    <>
      {/* NAV */}
      <header className="nav">
        <div className="wrap nav-inner">
          <a href="#top" className="brand">
            <span className="mk">N</span>otify
          </a>
          <nav className="nav-links">
            <a className="lk" href="#how">
              How it works
            </a>
            <a className="lk" href="#features">
              Features
            </a>
            <a className="lk" href="#origin">
              Why Notify
            </a>
          </nav>
          <div className="nav-cta">
            {session ? (
              <Link className="nav-signup" href="/home">
                Go to Notify
              </Link>
            ) : (
              <>
                <Link className="nav-login" href="/sign-in">
                  Log in
                </Link>
                <Link className="nav-signup" href="/sign-up">
                  Sign up free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero" id="top">
        <div className="wrap hero-inner mt-5!">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="dot"></span>For students, by students
            </span>
            <h1 className="head">
              Everyone&apos;s notes.
              <br />
              <em>One perfect</em> document.
            </h1>
            <p className="sub">
              Lectures move fast and half the class misses something. Notify
              pools your whole class&apos;s notes — PDFs, photos, even recorded
              lectures — and compiles them into one clean, fact-checked master
              document.
            </p>
            <div className="hero-cta">
              <Link
                className="btn btn-primary btn-lg"
                href={session ? "/home" : "/sign-up"}
              >
                Start a class free <span className="arrow">→</span>
              </Link>
              <Link
                className="btn btn-ghost btn-lg"
                href={session ? "/home" : "/sign-in"}
              >
                Log in
              </Link>
            </div>
            <div className="trust">
              <div className="avatars">
                <Image
                  src="/avatars/avatar1.jpg"
                  width={40}
                  height={40}
                  alt=""
                />
                <Image
                  src="/avatars/avatar2.jpg"
                  width={40}
                  height={40}
                  alt=""
                />
                <Image
                  src="/avatars/avatar3.jpg"
                  width={40}
                  height={40}
                  alt=""
                />
                <Image
                  src="/avatars/avatar4.jpg"
                  width={40}
                  height={40}
                  alt=""
                />
              </div>
              <span>Join classmates already studying smarter together</span>
            </div>
          </div>

          <div className="mock-stage">
            <div className="mock">
              <div className="mock-side">
                <div className="mock-brand">
                  <span className="mk">N</span>otify
                </div>
                <div className="mock-lbl">Classes</div>
                <div className="mock-nav on">HIST 1707</div>
                <div className="mock-nav">CS 1026</div>
                <div className="mock-lbl">Topics</div>
                <div className="mock-nav on">French Revolution</div>
                <div className="mock-nav">Globalization</div>
                <div className="mock-nav">Department stores</div>
              </div>
              <div className="mock-main">
                <div className="mock-top">
                  <span className="dim">HIST 1707</span>
                  <span className="sep">/</span>
                  <span className="ttl">French Revolution</span>
                  <div className="mock-tabs">
                    <span className="mock-tab on">Master Doc</span>
                    <span className="mock-tab">Collection</span>
                  </div>
                </div>
                <div className="mock-body">
                  <div className="mock-kick">Master Document</div>
                  <div className="mock-h1">The French Revolution</div>
                  <div className="mock-chips">
                    <span className="mock-chip">From 7 classmates</span>
                    <span className="mock-chip ok">✓ Fact-checked</span>
                  </div>
                  <div className="mock-h2">Causes of the Revolution</div>
                  <div className="mock-line w-full"></div>
                  <div className="mock-line w-[94%]"></div>
                  <div className="mock-line w-[88%]"></div>
                  <div className="mock-line w-[60%] mb-3.5"></div>
                  <div className="mock-h2">The Estates-General</div>
                  <div className="mock-line w-[96%]"></div>
                  <div className="mock-line w-[96%]"></div>
                  <div className="mock-line w-[96%]"></div>
                  <div className="mock-line w-[96%]"></div>
                  <div className="mock-line w-[96%]"></div>
                  <div className="mock-line w-[56%]"></div>
                </div>
              </div>
            </div>
            <div className="mock-floats">
              <div className="float-card float-a">
                <div className="ic">
                  <SunRaysIcon />
                </div>
                <div>
                  <div className="ft">Compiling…</div>
                  <div className="fs">7 sources merged</div>
                </div>
              </div>
              <div className="float-card float-b">
                <div className="ic">
                  <FileIcon />
                </div>
                <div>
                  <div className="ft">notes_wk3.pdf</div>
                  <div className="fs">added by Michelle</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ORIGIN */}
      <section className="origin" id="origin">
        <div className="wrap origin-inner p-10!">
          <q>
            Notify was born in a history lecture where the slides flew by,
            nothing got posted online, and everyone left with half a page of
            notes — and a different half.
          </q>
          <div className="by">
            The fix:{" "}
            <b>
              pool what everyone caught, and let AI stitch it into one complete
              record.
            </b>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="sec" id="how">
        <div className="wrap">
          <div className="sec-head">
            <div className="sec-kick">How it works</div>
            <h2 className="sec-title">
              From scattered notes to a shared source of truth in three steps.
            </h2>
          </div>
          <div className="steps">
            <div className="step">
              <div className="num">1</div>
              <h3>Join your class</h3>
              <p>
                Create a class or join one with a short code. Organize it into
                topics — one per lecture, unit, or exam — so notes never turn
                into a pile.
              </p>
            </div>
            <div className="step">
              <div className="num">2</div>
              <h3>Drop in your notes</h3>
              <p>
                Upload PDFs and photos, or paste a recorded-lecture link.
                Everyone contributes what they caught to the shared collection
                for that topic.
              </p>
            </div>
            <div className="step">
              <div className="num">3</div>
              <h3>Get the master doc</h3>
              <p>
                Notify reads every source, cross-references them, and produces
                one fact-checked document — so the whole class studies from the
                same complete record.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="sec" id="features">
        <div className="wrap">
          <div className="sec-head">
            <div className="sec-kick">Features</div>
            <h2 className="sec-title">
              Built for the way classes actually study.
            </h2>
          </div>
          <div className="feat-grid">
            <div className="feat">
              <div className="ic">
                <DocSparkleIcon />
              </div>
              <h3>AI that actually compiles</h3>
              <p>
                More than a merge. Notify reads every source, removes
                duplicates, fills the gaps one person missed with what another
                caught, and writes a coherent document.
              </p>
            </div>
            <div className="feat">
              <div className="ic">
                <BellIcon size={22} />
              </div>
              <h3>Stay in the loop</h3>
              <p>
                Get notified when a new master document drops, your role
                changes, or a classmate sends an invite. Weekly digests keep
                everything you missed within reach.
              </p>
            </div>
            <div className="feat">
              <div className="ic">
                <CollectionIcon size={22} />
              </div>
              <h3>One shared collection</h3>
              <p>
                Every classmate adds to a single topic collection — PDFs,
                photos, and lecture links — so nobody studies from an incomplete
                set again.
              </p>
            </div>
            <div className="feat">
              <div className="ic">
                <MembersIcon size={22} />
              </div>
              <h3>Class roles & permissions</h3>
              <p>
                Owners control who can upload, compile, and manage members.
                Contributors focus on content. Every action is gated by role so
                your class stays organized.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CLOSING CTA */}
      <section className="cta">
        <div className="wrap cta-inner">
          <h2>
            Stop comparing notes.
            <br />
            <em>Start sharing one.</em>
          </h2>
          <p>Free for students. Spin up your first class in under a minute.</p>
          <div className="hero-cta justify-center">
            <Link
              className="btn btn-primary btn-lg"
              href={session ? "/home" : "/sign-up"}
            >
              Sign up free <span className="arrow">→</span>
            </Link>
            <Link
              className="btn btn-ghost btn-lg"
              href={session ? "/home" : "/sign-in"}
            >
              Log in
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="foot">
        <div className="wrap foot-inner">
          <a href="#top" className="brand">
            <span className="mk">N</span>otify
          </a>
          <nav className="foot-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <Link href={session ? "/home" : "/sign-in"}>Log in</Link>
            <Link href={session ? "/home" : "/sign-up"}>Sign up</Link>
          </nav>
          <div className="cr">© 2026 Notify</div>
        </div>
      </footer>
    </>
  );
}
