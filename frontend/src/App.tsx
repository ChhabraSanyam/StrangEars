import { useState, useEffect } from "react";
import "./App.css";

type ViewState = "initial" | "form" | "guidelines";

function App() {
  const [currentView, setCurrentView] = useState<ViewState>("initial");
  const [username, setUsername] = useState("");
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [usernameConfirmed, setUsernameConfirmed] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [showButtonsAnimation, setShowButtonsAnimation] = useState(false);

  // Check if user has confirmed username (show buttons)
  const showButtons = usernameConfirmed && username.trim().length > 0;

  useEffect(() => {
    setShowButtonsAnimation(showButtons);
  }, [showButtons]);

  useEffect(() => {
    const handleScroll = (e: WheelEvent) => {
      e.preventDefault();

      // Don't allow scrolling away from form view when buttons are shown
      if (showButtons && currentView === "form") {
        return;
      }

      if (e.deltaY > 0) {
        // Scrolling down
        if (currentView === "initial") {
          setCurrentView("form");
        } else if (currentView === "form" && !showButtons) {
          setCurrentView("guidelines");
        }
      } else {
        // Scrolling up
        if (currentView === "guidelines") {
          setCurrentView("form");
        } else if (currentView === "form") {
          setCurrentView("initial");
        }
      }
    };

    window.addEventListener("wheel", handleScroll, { passive: false });
    return () => window.removeEventListener("wheel", handleScroll);
  }, [currentView, showButtons]);

  const handleVentClick = () => {
    console.log("User selected: Vent", { username, profilePhoto });
    // TODO: Navigate to waiting room or matching service
  };

  const handleListenClick = () => {
    console.log("User selected: Listen", { username, profilePhoto });
    // TODO: Navigate to waiting room or matching service
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfilePhoto(file);
    }
  };

  const handleUsernameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && username.trim().length > 0) {
      setUsernameConfirmed(true);
    }
  };

  const handleUsernameEdit = () => {
    setUsernameConfirmed(false);
  };

  return (
    <div className="h-screen bg-sage relative overflow-hidden" role="main">
      {/* Skip Navigation Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:text-slate-dark focus:px-4 focus:py-2 focus:rounded focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-slate-dark"
      >
        Skip to main content
      </a>
      
      {/* Background Leaf Elements */}
      <div
        className="fixed -top-[10%] -left-[15%] w-[40%] h-[60%] bg-[url('/assets/bg-leaf.png')] bg-contain bg-no-repeat opacity-15 z-1 -rotate-[15deg]"
        aria-hidden="true"
      />
      <div
        className="fixed -bottom-[10%] -right-[15%] w-[45%] h-[65%] bg-[url('/assets/bg-leaf.png')] bg-contain bg-no-repeat opacity-12 z-1 rotate-[25deg] scale-x-[-1]"
        aria-hidden="true"
      />
      <div
        className="fixed top-[2%] right-[15%] w-[25%] h-[35%] bg-[url('/assets/bg-leaf.png')] bg-contain bg-no-repeat opacity-08 z-1 rotate-[45deg]"
        aria-hidden="true"
      />
      <div
        className="fixed bottom-[15%] left-[15%] w-[30%] h-[40%] bg-[url('/assets/bg-leaf.png')] bg-contain bg-no-repeat opacity-[0.1] z-1 -rotate-[30deg] scale-y-[-1]"
        aria-hidden="true"
      />

      {/* Hero Section */}
      <header
        className={`absolute top-0 left-0 w-full h-screen flex flex-col justify-center items-center text-center z-2 px-8 transition-all duration-800 ease-hero md:scale-90 xs:scale-85 ${
          currentView !== "initial"
            ? "hero-minimized scale-85 -translate-y-[35vh] md:scale-90 md:-translate-y-[30vh] xs:scale-90 xs:-translate-y-[30vh]"
            : ""
        }`}
        role="banner"
      >
        <div
          className={`flex items-center justify-center relative w-full -translate-x-6 transition-[margin-bottom] duration-800 ease-hero md:-translate-x-4 xs:-translate-x-3 ${
            currentView !== "initial"
              ? "mb-1 mt-8 md:mt-6 xs:mt-4"
              : "mb-4 mt-8 md:mb-6 md:mt-6 xs:mb-4 xs:mt-4"
          }`}
        >
          <img
            src="/assets/logo.png"
            alt="StrangEars Logo"
            className="h-24 w-auto mr-3 -translate-y-4 md:h-20 md:mr-2 md:-translate-y-3 xs:h-16 xs:mr-2 xs:-translate-y-2"
          />
          <h1 className="font-jomhuria text-[14rem] font-normal text-charcoal tracking-[0.005em] leading-[0.8] md:text-[10rem] xs:text-[8rem]">
            StrangEars
          </h1>
        </div>

        <div className={`mb-24 ${showButtons ? "tagline-compact" : ""}`}>
          <h2 className="main-tagline">
            Hear. Vent. Connect.
            <img
              src="/assets/chat-bubble.png"
              alt="Chat Bubble"
              className="absolute -top-6 -right-10 h-14 w-auto opacity-60 md:h-10 md:-right-7 md:-top-4 xs:h-8 xs:-right-6 xs:-top-3"
            />
          </h2>
          <p
            className={`font-young-serif text-2xl text-slate-medium font-normal max-w-3xl mx-auto leading-relaxed whitespace-nowrap transition-all duration-1000 ease-out will-change-[opacity,transform] md:text-xl md:whitespace-normal xs:text-lg ${
              showButtons
                ? "opacity-0 -translate-y-4"
                : "opacity-100 translate-y-0"
            }`}
          >
            Sometimes you need to talk. Sometimes, just to listen.
          </p>
        </div>

        <div
          className={`absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center transition-opacity duration-[400ms] ease-out ${
            currentView !== "initial" ? "opacity-0" : "opacity-100"
          }`}
        >
          <p className="text-base text-gray-light mb-4 font-medium">
            Scroll to get started
          </p>
          <div className="w-2 h-2 bg-gray-light rounded-full animate-bounce-slow"></div>
        </div>
      </header>

      {/* Content Area */}
      <main id="main-content" className="content-area">
        {/* Live region for screen reader announcements */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {currentView === "form" && "Username form is now visible"}
          {showButtons && "Action buttons are now available"}
          {currentView === "guidelines" && "Safety guidelines are now displayed"}
        </div>

        {/* Username Form Section */}
        <section
          className={`flex flex-row items-center gap-8 absolute left-1/2 transition-all duration-1000 ease-hero pointer-events-none opacity-0 translate-y-12 -translate-x-1/2 md:gap-5 xs:gap-4 ${
            currentView === "form" || currentView === "guidelines"
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : ""
          } ${
            showButtons
              ? "top-[25%] -translate-y-1/2"
              : "top-[35%] -translate-y-1/2"
          }`}
          aria-label="User profile setup"
        >
          <div className="relative flex flex-col items-center gap-2 flex-shrink-0">
            {profilePhoto ? (
              <img
                src={URL.createObjectURL(profilePhoto)}
                alt="Profile"
                className="w-20 h-20 rounded-full object-cover cursor-pointer transition-transform duration-300 ease-in-out hover:scale-105 xs:w-[70px] xs:h-[70px]"
                onClick={() => document.getElementById("photo-upload")?.click()}
              />
            ) : (
              <div
                className="w-20 h-20 rounded-full bg-purple-photo flex items-center justify-center text-white relative cursor-pointer transition-all duration-300 ease-in-out hover:bg-purple-photo-hover hover:scale-105 xs:w-[70px] xs:h-[70px] focus:outline-none focus:ring-2 focus:ring-slate-dark focus:ring-offset-2"
                onClick={() => document.getElementById("photo-upload")?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    document.getElementById("photo-upload")?.click();
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label="Upload profile photo"
              >
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <div className="absolute -bottom-0.5 -right-0.5 bg-slate-dark text-white rounded-full w-6 h-6 flex items-center justify-center border-2 border-sage xs:w-5 xs:h-5">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </div>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
              id="photo-upload"
              aria-label="Upload profile photo (optional)"
              aria-describedby="photo-help"
            />
            <div id="photo-help" className="sr-only">
              Optional: Upload a profile photo to personalize your chat experience. Click the profile circle to select an image.
            </div>
          </div>

          <div className="flex items-center gap-4 flex-1">
            <div id="username-help" className="sr-only">
              Enter a nickname to use during your chat session. This will be visible to other users.
            </div>
            {usernameConfirmed ? (
              <span
                className="font-inter text-2xl text-slate-dark font-medium min-w-[150px] cursor-pointer py-2 px-2 rounded transition-colors duration-200 ease-in-out hover:bg-slate-dark hover:bg-opacity-10 md:text-xl xs:text-lg xs:min-w-[120px]"
                onClick={handleUsernameEdit}
                title="Click to edit"
              >
                {username}
              </span>
            ) : (
              <input
                type="text"
                placeholder="Nickname"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={handleUsernameKeyDown}
                className="py-3 px-6 border-2 border-gray-border rounded-lg text-base bg-transparent text-slate-dark transition-all duration-300 ease-in-out outline-none min-w-[250px] placeholder:text-gray-placeholder focus:border-slate-dark focus:shadow-[0_0_0_3px_rgba(45,55,72,0.1)] md:min-w-[180px] md:text-[0.95rem] md:py-[0.65rem] md:px-5 xs:min-w-[150px] xs:text-[0.9rem] xs:py-[0.6rem] xs:px-4"
                maxLength={20}
                autoFocus
                aria-label="Enter your nickname for the chat session"
                aria-describedby="username-help"
                role="textbox"
              />
            )}
          </div>
        </section>

        {/* Question and Action Buttons */}
        {showButtons && (
          <section
            className={`absolute top-[65%] left-1/2 text-center z-10 ${
              showButtonsAnimation
                ? "-translate-x-1/2 animate-fade-in-up-delayed"
                : "opacity-0 -translate-x-1/2 translate-y-[30px]"
            }`}
            aria-label="Choose your chat role"
          >
            <h3 className="font-prata text-[1.8rem] text-slate-dark mb-14 font-normal max-w-[500px] whitespace-nowrap md:text-2xl xs:text-[1.3rem]">
              Will you share, or lend a listening ear?
            </h3>
            <div className="flex justify-between w-full max-w-[800px] md:max-w-[500px] xs:max-w-[500px] mx-auto relative h-auto min-h-[60px]">
              <button
                onClick={handleVentClick}
                className="action-button vent-button"
                onMouseEnter={() => setHoveredButton("vent")}
                onMouseLeave={() => setHoveredButton(null)}
                aria-label="Choose to vent - talk to someone who will listen with empathy"
                aria-describedby="vent-description"
              >
                <span id="vent-description" className="sr-only">
                  Select this option if you need to talk and share your thoughts with a supportive listener
                </span>
                {hoveredButton === "vent"
                  ? "Let it out—talk to someone who'll listen with empathy and zero judgment."
                  : "I need to vent"}
              </button>

              <button
                onClick={handleListenClick}
                className="action-button listen-button"
                onMouseEnter={() => setHoveredButton("listen")}
                onMouseLeave={() => setHoveredButton(null)}
                aria-label="Choose to listen - help others feel heard and understood"
                aria-describedby="listen-description"
              >
                <span id="listen-description" className="sr-only">
                  Select this option if you want to listen and provide support to someone who needs to talk
                </span>
                {hoveredButton === "listen"
                  ? "Choose to listen and help others feel heard, understood, and less alone."
                  : "I want to listen"}
              </button>
            </div>
          </section>
        )}

        {/* Guidelines Section */}
        <section
          className={`max-w-[700px] text-left absolute bottom-12 md:bottom-8 xs:bottom-6 left-1/2 -translate-x-1/2 transition-all duration-800 ease-hero ${
            currentView === "guidelines" && !showButtons
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 translate-y-12 pointer-events-none"
          }`}
          aria-label="Safety guidelines and community rules"
        >
          <h3 className="font-ysabeau text-3xl md:text-2xl xs:text-lg text-slate-medium mb-4 font-bold italic">
            Stay Safe & Anonymous-
          </h3>
          <ul className="list-none p-0 mb-5 md:mb-3 xs:mb-2">
            <li className="font-ysabeau text-lg md:text-base xs:text-sm text-slate-medium mb-1 md:mb-0.5 xs:mb-0 pl-6 relative leading-tight md:leading-snug xs:leading-snug font-bold italic before:content-['•'] before:text-slate-medium before:font-bold before:absolute before:left-0 before:text-xl">
              Don't share your real name or personal information with anyone
              here.
            </li>
            <li className="font-ysabeau text-lg md:text-base xs:text-sm text-slate-medium mb-1 md:mb-0.5 xs:mb-0 pl-6 relative leading-tight md:leading-snug xs:leading-snug font-bold italic before:content-['•'] before:text-slate-medium before:font-bold before:absolute before:left-0 before:text-xl">
              Never give out passwords or financial details.
            </li>
            <li className="font-ysabeau text-lg md:text-base xs:text-sm text-slate-medium mb-1 md:mb-0.5 xs:mb-0 pl-6 relative leading-tight md:leading-snug xs:leading-snug font-bold italic before:content-['•'] before:text-slate-medium before:font-bold before:absolute before:left-0 before:text-xl">
              If someone asks for personal info, end the chat and report them.
            </li>
          </ul>
          <p className="font-ysabeau text-xl md:text-lg xs:text-sm text-slate-medium text-center italic font-bold">
            Let's keep this a safe and supportive space for everyone!
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
