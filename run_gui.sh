#!/bin/bash

echo -ne "\033]0;GravityDesk Control Center\007"

echo "Starting GravityDesk Desktop GUI..."

python3 gui.py > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo ""
    echo "An error occurred running GravityDesk. Press any key to exit."
    
    read -n 1 -s -r
fi