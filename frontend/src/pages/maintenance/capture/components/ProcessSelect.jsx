import { useState, useRef, useEffect } from "react";

export default function ProcessSelect({
  processes,
  selectedValue,
  onSelect,
  placeholder = "--Select All--",
  searchPlaceholder = "Search process...",
  noResultsText = "No results found",
  ariaLabelledBy,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const filteredProcesses = processes.filter(p => {
    const text = p.description 
      ? `${p.process_name} (${p.description})`
      : p.process_name;
    return text.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const displayProcesses = [
    { id: "", process_name: placeholder },
    ...filteredProcesses
  ];

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    setSearchTerm("");
    setHighlightedIndex(0);
  };

  const handleSelect = (process) => {
    // Capture maintenance legacy behavior: use process DB id for filtering.
    const value = process.id != null && process.process_name !== placeholder ? String(process.id) : "";
    onSelect(value);
    setIsOpen(false);
  };

  const getDisplayText = (value) => {
    if (!value) return placeholder;
    const p = processes.find(proc => String(proc.id) === String(value));
    if (!p) return placeholder;
    return p.description 
      ? `${p.process_name} (${p.description})`
      : p.process_name;
  };

  const handleKeyDown = (e) => {
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % displayProcesses.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + displayProcesses.length) % displayProcesses.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(displayProcesses[highlightedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="custom-select-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className={`custom-select-button ${isOpen ? "open" : ""}`}
        onClick={handleToggle}
        aria-labelledby={ariaLabelledBy || undefined}
      >
        {getDisplayText(selectedValue)}
      </button>
      
      {isOpen && (
        <div className="custom-select-dropdown show">
          <div className="custom-select-search">
            <input 
              type="text" 
              placeholder={searchPlaceholder}
              autoComplete="off" 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              ref={searchInputRef}
            />
          </div>
          <div className="custom-select-options">
            {displayProcesses.length > 0 ? (
              displayProcesses.map((p, index) => {
                const value = p.id != null && p.process_name !== placeholder ? String(p.id) : "";
                const text = p.process_name !== placeholder 
                  ? (p.description ? `${p.process_name} (${p.description})` : p.process_name)
                  : placeholder;
                
                return (
                  <div 
                    key={index}
                    className={`custom-select-option ${selectedValue === value ? "selected" : ""} ${highlightedIndex === index ? "highlighted" : ""}`}
                    onClick={() => handleSelect(p)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    {text}
                  </div>
                );
              })
            ) : (
              <div className="custom-select-no-results">{noResultsText}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
