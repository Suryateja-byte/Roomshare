import * as React from "react"
import { cn } from "@/lib/utils"

export interface LabelProps
    extends React.LabelHTMLAttributes<HTMLLabelElement> { }

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
    ({ className, ...props }, ref) => {
        return (
            <label
                ref={ref}
                className={cn(
                    "block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2 pl-1",
                    className
                )}
                {...props}
            />
        )
    }
)
Label.displayName = "Label"

export { Label }
