import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

interface Props {
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
}

function SidebarPortal({ isOpen, onClose, children }: Props) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence initial={false} mode="wait">
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9998] bg-black/80"
            onClick={onClose}
          />

          {/* Right Panel */}
          <motion.aside
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 right-0 z-[9999] h-screen md:w-[400px] md:max-w-[90vw] sm:w-full sm:max-w-full bg-background border-l"
          >
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default SidebarPortal;
