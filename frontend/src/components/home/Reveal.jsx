import { useReveal, usePrefersReducedMotion } from '../../hooks/useReveal';

/**
 * Fades a block up as it enters the viewport.
 *
 * `delay` staggers siblings. Under reduced-motion the element simply renders —
 * no transform, no delay, because a staggered fade is still motion.
 */
export default function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const [ref, shown] = useReveal();
  const reduced = usePrefersReducedMotion();

  if (reduced) {
    return (
      <Tag ref={ref} className={className} {...rest}>
        {children}
      </Tag>
    );
  }

  return (
    <Tag
      ref={ref}
      className={[
        'transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0',
        className,
      ].join(' ')}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
