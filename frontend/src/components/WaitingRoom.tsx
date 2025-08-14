import { useState, useEffect } from "react";

interface WaitingRoomProps {
  userType: "venter" | "listener";
  estimatedWaitTime: number;
  onCancel: () => void;
}

const WaitingRoom: React.FC<WaitingRoomProps> = ({
  userType,
  estimatedWaitTime,
  onCancel,
}) => {
  const [currentWaitTime, setCurrentWaitTime] = useState(estimatedWaitTime);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  // Encouraging messages to display during wait
  const encouragingMessages = [
    "Finding someone who's ready to connect...",
    "Your conversation partner is just around the corner...",
    "Building a safe space for meaningful connection...",
    "Almost there - It's brave to ask for help when you need it...",
    "Creating the perfect match for your needs...",
    "Good things take time - your connection is coming...",
    "Preparing a supportive environment for you both...",
    "Your patience will be rewarded with genuine connection...",
  ];

  // Update elapsed time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Update encouraging message every 4 seconds
  useEffect(() => {
    const messageTimer = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % encouragingMessages.length);
    }, 4000);

    return () => clearInterval(messageTimer);
  }, [encouragingMessages.length]);

  // Update wait time estimate based on elapsed time
  useEffect(() => {
    if (currentWaitTime > 0) {
      setCurrentWaitTime(Math.max(0, estimatedWaitTime - elapsedTime));
    }
  }, [elapsedTime, estimatedWaitTime]);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getWaitTimeDisplay = (): string => {
    if (currentWaitTime <= 0) {
      return "Any moment now...";
    }
    return `~${formatTime(currentWaitTime)} remaining`;
  };

  const getUserTypeMessage = (): string => {
    return userType === "venter"
      ? "Looking for someone ready to listen..."
      : "Finding someone who needs a caring ear...";
  };

  return (
    <div className="waiting-room h-screen bg-sage relative overflow-hidden flex flex-col items-center justify-center">
      {/* Background Elements */}
      <div
        className="fixed -top-[25%] -left-[14%] w-[40%] h-[60%] bg-[url('/assets/bg-leaf.webp')] bg-contain bg-no-repeat opacity-70 z-1 -rotate-[70deg]"
        aria-hidden="true"
      />
      <div
        className="fixed -bottom-[-5%] -right-[15%] w-[45%] h-[65%] bg-[url('/assets/bg-leaf.webp')] bg-contain bg-no-repeat opacity-70 z-1 rotate-[80deg] scale-x-[-1]"
        aria-hidden="true"
      />

      {/* Main Content */}
      <div className="text-center z-10 max-w-2xl mx-auto px-8">
        {/* Logo */}
        <div className="flex items-center justify-center mb-8">
          <img
            src="/assets/logo.webp"
            alt="StrangEars Logo"
            className="h-16 w-auto mr-2 flex-shrink-0 -mt-5"
          />
          <h1 className="font-jomhuria text-9xl font-normal text-charcoal tracking-[0.005em] leading-[0.8] flex-shrink-0">
            StrangEars
          </h1>
        </div>

        {/* Loading Animation */}
        <div className="mb-8">
          <div className="relative w-24 h-24 mx-auto mb-6">
            {/* Outer spinning ring */}
            <div className="absolute inset-0 border-4 border-slate-medium border-opacity-20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-transparent border-t-slate-medium rounded-full animate-spin"></div>

            {/* Inner pulsing dot */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3 h-3 bg-slate-medium rounded-full animate-pulse"></div>
            </div>
          </div>

          {/* Status Messages */}
          <div className="space-y-4">
            <h2 className="font-prata text-2xl text-slate-dark font-normal">
              {getUserTypeMessage()}
            </h2>

            <p className="font-young-serif text-lg text-slate-medium">
              {encouragingMessages[currentMessageIndex]}
            </p>

            {/* Wait Time Display */}
            <div className="bg-white bg-opacity-50 rounded-lg p-4 backdrop-blur-sm">
              <p className="font-inter text-base text-slate-dark font-medium">
                Estimated wait time:{" "}
                <span className="font-semibold">{getWaitTimeDisplay()}</span>
              </p>
              <p className="font-inter text-sm text-slate-medium mt-1">
                You've been waiting for {formatTime(elapsedTime)}
              </p>
            </div>
          </div>
        </div>

        {/* Cancel Button */}
        <button
          onClick={onCancel}
          className="bg-transparent border-2 border-slate-medium text-slate-medium px-8 py-3 rounded-lg font-inter font-medium text-base transition-all duration-300 ease-in-out hover:bg-slate-medium hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-dark focus:ring-offset-2 focus:ring-offset-sage"
          aria-label="Cancel matching and return to main page"
        >
          Cancel & Go Back
        </button>

        {/* Additional Info */}
        <div className="mt-8 text-center">
          <p className="font-ysabeau text-sm text-slate-medium italic">
            We're working hard to find you the perfect conversation partner.
            <br />
            Thank you for your patience! 💚
          </p>
        </div>
      </div>

      {/* Live region for screen reader updates */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {`Waiting for match. ${getWaitTimeDisplay()}. ${
          encouragingMessages[currentMessageIndex]
        }`}
      </div>
    </div>
  );
};

export default WaitingRoom;
