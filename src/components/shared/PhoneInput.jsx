import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";

const COUNTRY_CODES = [
  { code: '+1', country: 'USA/Canada' },
  { code: '+44', country: 'UK' },
  { code: '+91', country: 'India' },
  { code: '+852', country: 'Hong Kong' },
  { code: '+65', country: 'Singapore' },
  { code: '+60', country: 'Malaysia' },
  { code: '+66', country: 'Thailand' },
  { code: '+62', country: 'Indonesia' },
  { code: '+63', country: 'Philippines' },
  { code: '+81', country: 'Japan' },
  { code: '+86', country: 'China' },
  { code: '+886', country: 'Taiwan' },
  { code: '+82', country: 'South Korea' },
  { code: '+61', country: 'Australia' },
];

export default function PhoneInput({ label = "Phone Number", value = "", onChange, placeholder = "Enter phone number" }) {
  const [countryCode, setCountryCode] = React.useState('+852');
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (value) {
      // Match against actual country codes to avoid greedy matching
      const foundCode = COUNTRY_CODES.find(cc => value.startsWith(cc.code));
      if (foundCode) {
        setCountryCode(foundCode.code);
        setPhoneNumber(value.slice(foundCode.code.length));
      } else {
        setPhoneNumber(value);
      }
    }
  }, [value]);

  const handlePhoneChange = (e) => {
    const phone = e.target.value;
    setPhoneNumber(phone);
    onChange(`${countryCode}${phone}`);
  };

  const handleCountryCodeChange = (code) => {
    setCountryCode(code);
    onChange(`${code}${phoneNumber}`);
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-20 justify-between px-2">
              {countryCode}
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2">
            <div className="max-h-48 overflow-y-auto space-y-1">
              {COUNTRY_CODES.map(({ code, country }) => (
                <button
                  key={code}
                  onClick={() => handleCountryCodeChange(code)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-muted text-sm"
                >
                  {code} {country}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Input
          type="tel"
          placeholder={placeholder}
          value={phoneNumber}
          onChange={handlePhoneChange}
          className="flex-1"
        />
      </div>
    </div>
  );
}