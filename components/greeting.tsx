import { motion } from 'framer-motion';
import { useAgent } from './agent-provider';

export const Greeting = () => {
  const { currentAgent } = useAgent();

  // Get a random greeting from the agent, or use default
  const getGreeting = () => {
    if (currentAgent?.greetings && currentAgent.greetings.length > 0) {
      const randomIndex = Math.floor(
        Math.random() * currentAgent.greetings.length,
      );
      return (
        currentAgent.greetings[randomIndex]?.text || 'How can I help you today?'
      );
    }
    return 'How can I help you today?';
  };

  const greetingText = getGreeting();

  return (
    <div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20 px-8 size-full flex flex-col justify-center"
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5 }}
        className="text-2xl font-semibold"
      >
        {greetingText}
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.6 }}
        className="text-2xl text-zinc-500"
      />
    </div>
  );
};
