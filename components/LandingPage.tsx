import Link from 'next/link'
import Image from 'next/image'

export default function LandingPage(){
  return (
    <main className="home-page">
      <div className="home-shell">
        <header className="home-header">
          <Link className="home-brand" href="/">
            <Image className="home-logo" src="/logo.jpg" alt="JCM Tailoring" width={40} height={40} priority/>
            <span>FABRI<em>CUT</em></span>
          </Link>
          <nav className="home-nav" aria-label="Homepage">
            <a href="#services">Services</a>
            <Link href="/about">About</Link>
            <a href="#hours">Hours</a>
            <a href="#contact">Contact</a>
          </nav>
          <Link className="home-chip" href="/login">Sign in</Link>
        </header>

        <section className="home-split">
          <div className="home-hero">
            <p className="home-kicker">J.C.M. Tailoring</p>
            <h1 className="home-title">Stitching dreams into reality.</h1>
            <p className="home-lede">Your Trusted Partner for Custom-Fitted Attire</p>
            <p className="home-body">Expert craftsmanship meets modern style. We bring your tailoring vision to life with precision and care.</p>
            <div className="home-actions">
              <Link className="home-btn home-btn-navy" href="/about">About Us</Link>
              <Link className="home-btn home-btn-ghost" href="/login">Sign in</Link>
            </div>
          </div>
          <aside className="home-visit">
            <div>
              <h2>Visit the workshop</h2>
              <p>Lumang Patengko, Victoria, Oriental Mindoro</p>
              <p><a href="tel:+123456789">+123456789</a></p>
              <p><a href="mailto:fortunejcm@gmail.com">fortunejcm@gmail.com</a></p>
            </div>
            <div>
              <span className="home-hl">Business hours</span>
              <p>Monday–Tuesday: 6:30 AM–6:30 PM</p>
              <p>Thursday–Saturday: 6:00 AM–5:00 PM</p>
              <p>Wednesday and Sunday: Closed</p>
            </div>
          </aside>
        </section>

        <section className="home-bento" id="services">
          <article className="home-tile home-tile-about" id="about">
            <div className="home-idx">01</div>
            <h3>About Us</h3>
            <p>J.C.M. Tailoring provides expert stitching and personalized garment services. We focus on quality, attention to detail, and customer satisfaction to deliver perfectly fitted clothing.</p>
            <p>Our skilled team combines traditional craftsmanship with modern style. From bespoke suits to dress alterations, we handle every project with meticulous attention to detail.</p>
          </article>
          <article className="home-tile home-tile-navy">
            <div className="home-idx">02</div>
            <h3>Bespoke Suits &amp; Formal Wear</h3>
            <p>Expert stitching for occasion-ready garments, finished with meticulous care.</p>
          </article>
          <article className="home-tile home-tile-yellow">
            <div className="home-idx">03</div>
            <h3>Custom-fitted garments</h3>
            <p>Personalized garment services made to deliver a perfect fit.</p>
          </article>
          <article className="home-tile home-tile-paper">
            <div className="home-idx">04</div>
            <h3>Dress alterations and repairs</h3>
            <p>Refinements and repairs handled with attention to detail.</p>
          </article>
          <article className="home-tile home-tile-blue">
            <div className="home-idx">05</div>
            <h3>Personalized tailoring and garment fitting</h3>
            <p>We bring your tailoring vision to life with precision and care.</p>
          </article>
        </section>

        <section className="home-about-row">
          <div className="home-hours" id="hours">
            <h3>Business hours</h3>
            <p>Monday–Tuesday: 6:30 AM–6:30 PM</p>
            <p>Wednesday: Closed</p>
            <p>Thursday–Saturday: 6:00 AM–5:00 PM</p>
            <p>Sunday: Closed</p>
            <p className="home-break-label">Break times</p>
            <p>9:30–10:00 AM · 12:00 NN–1:00 PM · 3:00–3:30 PM</p>
          </div>
          <div className="home-contact" id="contact">
            <h3>Contact us</h3>
            <p><a href="tel:+123456789">+123456789</a></p>
            <p><a href="mailto:fortunejcm@gmail.com">fortunejcm@gmail.com</a></p>
            <p>Lumang Patengko, Victoria, Oriental Mindoro</p>
            <p className="home-promo">Follow our social networks for promotions, styles and updates.</p>
          </div>
        </section>

        <section className="home-cta" id="signin">
          <h2>Visit the workshop, or sign in if you are on the J.C.M. Tailoring staff.</h2>
          <Link className="home-btn home-btn-navy" href="/login">Sign in</Link>
        </section>

        <footer className="home-footer">
          <div>FABRICUT · J.C.M. Tailoring</div>
          <div>Lumang Patengko, Victoria, Oriental Mindoro</div>
        </footer>
      </div>
    </main>
  )
}
