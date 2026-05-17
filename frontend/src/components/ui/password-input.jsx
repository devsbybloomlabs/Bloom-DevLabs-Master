/**
 * PasswordInput — wraps shadcn <Input type="password"> with a built-in
 * show/hide toggle (eye icon). Drop-in replacement for any password field.
 *
 * Forwards all standard <input> props. `inputClassName` lets the parent
 * pass classes through to the actual input element (padding-right is
 * already reserved for the toggle button).
 */
import { useState, forwardRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PasswordInput = forwardRef(function PasswordInput(
  { className, inputClassName, "data-testid": testId, ...props },
  ref,
) {
  const [shown, setShown] = useState(false);
  return (
    <div className={cn("relative", className)}>
      <Input
        ref={ref}
        type={shown ? "text" : "password"}
        className={cn("pr-10", inputClassName)}
        data-testid={testId}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        data-testid={testId ? `${testId}-toggle` : "password-toggle"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-700 focus:outline-none focus:text-slate-900 transition"
        tabIndex={-1}
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});

export default PasswordInput;
