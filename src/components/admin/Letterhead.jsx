// src/components/admin/Letterhead.jsx
// Print-only letterhead shared by Logbook, Reports, Medical Summary, and
// Medical Certificate panels. Reuses the same three seal images.
import gordonCollegeSeal from "../../assets/certificate/gordon-college-seal.png";
import oswsSeal from "../../assets/certificate/osws-seal.png";
import healthServicesSeal from "../../assets/certificate/health-services-seal.png";

export default function Letterhead({ className = "hidden print:flex items-center gap-3 mb-4 pb-4 border-b border-gray-300" }) {
  return (
    <div className={className}>
      <div className="flex-1 flex items-center gap-2">
        <img src={gordonCollegeSeal} alt="Gordon College seal" className="w-14 h-14 object-contain" />
        <img src={oswsSeal} alt="Office of Student Welfare and Services seal" className="w-14 h-14 object-contain" />
      </div>
      <div className="flex-1 text-center px-2">
        <h1 className="font-bold text-gc-green text-lg tracking-wide">GORDON COLLEGE</h1>
        <p className="text-xs text-gray-600 leading-snug">
          Olongapo City Sports Complex, Donor Street, East Tapinac, Olongapo City
        </p>
        <p className="text-xs text-gray-600 leading-snug">Tel. No.: (047) 222-4080</p>
        <p className="font-bold text-gc-green text-sm mt-1">Office of Student Welfare and Service — Health Services Unit</p>
      </div>
      <div className="flex-1 flex items-center justify-end">
        <img src={healthServicesSeal} alt="Health Services Unit seal" className="w-14 h-14 object-contain" />
      </div>
    </div>
  );
}
