import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
    icon: LucideIcon;
    title: string;
    description: string;
    iconColorClass: string;
    bgColorClass: string;
}

export default function FeatureCard({ icon: Icon, title, description, iconColorClass, bgColorClass }: FeatureCardProps) {
    return (
        <div className="p-8 group text-center">
            <div className={`w-16 h-16 mx-auto rounded-full ${bgColorClass} flex items-center justify-center mb-5 group-hover:scale-105 transition-transform duration-500`}>
                <Icon className={`w-8 h-8 ${iconColorClass}`} />
            </div>
            <h3 className="text-xl font-bold mb-2 text-foreground">{title}</h3>
            <p className="text-base font-medium text-muted-foreground">{description}</p>
        </div>
    );
}
