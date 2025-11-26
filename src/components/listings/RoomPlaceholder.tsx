import React from 'react';
import { Image as ImageIcon } from 'lucide-react';

export default function RoomPlaceholder() {
    return (
        <div className="w-full h-[400px] bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 relative overflow-hidden">
            {/* Decorative Background Circles (Optional: adds the soft glow) */}
            <div className="absolute top-10 left-10 w-32 h-32 bg-indigo-50 rounded-full blur-3xl opacity-50"></div>
            <div className="absolute bottom-10 right-10 w-48 h-48 bg-pink-50 rounded-full blur-3xl opacity-50"></div>

            {/* Main Content */}
            <div className="z-10 flex flex-col items-center">
                <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                    <ImageIcon size={48} className="text-slate-300" />
                </div>
                <h3 className="text-lg font-medium text-slate-600">No photos available yet</h3>
                <p className="text-sm text-slate-400 mt-1">Request a viewing to see the property in person.</p>

                {/* Call to Action Button */}
                <button className="mt-6 px-6 py-2 bg-white border border-slate-300 rounded-full text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm">
                    Contact Host for Photos
                </button>
            </div>
        </div>
    );
}
