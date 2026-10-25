#!/bin/bash
echo "=== SkyRewind Merged Build Verification ==="
echo ""

# Check files exist
FILES=(
    "backend/app.py"
    "backend/database.py"
    "backend/__init__.py"
    "frontend/index.html"
    "frontend/app.js"
    "frontend/style.css"
    "services/aircraft-proxy.py"
    "services/recorder.py"
    "systemd/skyrewind-merged-web.service"
    "systemd/skyrewind-merged-recorder.service"
    "systemd/skyrewind-merged-aircraft-proxy.service"
    "requirements.txt"
    "venv/bin/python3"
    "venv/bin/gunicorn"
)

echo "Checking files..."
MISSING=0
for file in "${FILES[@]}"; do
    if [ -f "/opt/skyrewind-merged/$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ✗ MISSING: $file"
        MISSING=$((MISSING + 1))
    fi
done

echo ""
if [ $MISSING -eq 0 ]; then
    echo "✅ All files present"
else
    echo "❌ $MISSING files missing"
    exit 1
fi

# Check venv packages
echo ""
echo "Checking Python packages..."
if /opt/skyrewind-merged/venv/bin/pip show Flask gunicorn Werkzeug > /dev/null 2>&1; then
    echo "  ✓ Flask, Werkzeug, gunicorn installed"
else
    echo "  ✗ Some packages missing"
    exit 1
fi

# Check port availability
echo ""
echo "Checking ports..."
if ss -tln | grep -q ':5003'; then
    echo "  ⚠ Port 5003 already in use"
else
    echo "  ✓ Port 5003 available"
fi

if ss -tln | grep -q ':8080'; then
    echo "  ⚠ Port 8080 already in use"
else
    echo "  ✓ Port 8080 available"
fi

# Check live SkyRewind untouched
echo ""
echo "Checking live SkyRewind..."
if curl -s http://localhost:5000 | grep -q "SkyRewind"; then
    echo "  ✓ Live SkyRewind still serving on :5000"
else
    echo "  ✗ Live SkyRewind not responding"
fi

echo ""
echo "=== Build verification complete ==="
echo ""
echo "Next: Run commands in SETUP_INSTRUCTIONS.txt to start services"
