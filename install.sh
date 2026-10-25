#!/bin/bash
set -e

echo "=== SkyRewind Merged Installation ==="
echo ""

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Install dependencies
echo "Installing Python dependencies..."
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

# Set up data directory with skyrewind ownership
echo "Setting up data directory..."
sudo mkdir -p data/uploads
sudo chown -R skyrewind:skyrewind data
sudo chmod 775 data data/uploads

# Install systemd units
echo "Installing systemd service units..."
sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload

# Enable services
echo "Enabling services..."
sudo systemctl enable skyrewind-merged-aircraft-proxy.service
sudo systemctl enable skyrewind-merged-recorder.service
sudo systemctl enable skyrewind-merged-web.service

echo ""
echo "Installation complete!"
echo ""
echo "To start services:"
echo "  sudo systemctl start skyrewind-merged-aircraft-proxy"
echo "  sudo systemctl start skyrewind-merged-recorder"
echo "  sudo systemctl start skyrewind-merged-web"
echo ""
echo "To check status:"
echo "  sudo systemctl status skyrewind-merged-aircraft-proxy"
echo "  sudo systemctl status skyrewind-merged-recorder"
echo "  sudo systemctl status skyrewind-merged-web"
echo ""
echo "Web interface will be available at http://localhost:5003"
