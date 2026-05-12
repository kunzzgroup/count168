import { useState, useRef, useEffect } from "react";

export default function ProcessSelect({
  processes,
  selectedValue,
  onSelect,
  placeholder = "--Select All--",
  searchPlaceholder = "Search process...",
  noResultsText = "No results found",
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
    // Transaction maintenance uses process_name as value based on original JS
    const value = process.id != null ? String(process.process_name) : "";
    onSelect(value);
    setIsOpen(false);
  };

  const getDisplayText = (value) => {
    if (!value) return placeholder;
    const p = processes.find(proc => String(proc.process_name) === value);
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
                const value = p.id != null ? String(p.process_name) : "";
                const text = p.id != null 
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
