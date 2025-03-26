import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface AvatarEditorProps {
  username: string;
  currentAvatarColor?: string;
  currentAvatarShape?: 'circle' | 'square' | 'rounded';
  currentAvatarInitials?: string;
  onSave: (avatarColor: string, avatarShape: 'circle' | 'square' | 'rounded', avatarInitials: string) => void;
  onCancel: () => void;
}

export function AvatarEditor({
  username,
  currentAvatarColor = '#6366f1', // Default indigo color
  currentAvatarShape = 'circle',
  currentAvatarInitials,
  onSave,
  onCancel
}: AvatarEditorProps) {
  // State for the avatar properties
  const [avatarColor, setAvatarColor] = useState<string>(currentAvatarColor);
  const [avatarShape, setAvatarShape] = useState<'circle' | 'square' | 'rounded'>(currentAvatarShape);
  const [avatarInitials, setAvatarInitials] = useState<string>(
    currentAvatarInitials || username.charAt(0).toUpperCase()
  );

  // Predefined colors
  const colorOptions = [
    { value: '#6366f1', label: 'Indigo' },
    { value: '#ec4899', label: 'Pink' },
    { value: '#10b981', label: 'Emerald' },
    { value: '#f97316', label: 'Orange' },
    { value: '#06b6d4', label: 'Cyan' },
    { value: '#8b5cf6', label: 'Violet' },
    { value: '#ef4444', label: 'Red' },
    { value: '#eab308', label: 'Yellow' },
  ];

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(avatarColor, avatarShape, avatarInitials);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">Customize Your Avatar</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          {/* Avatar Preview */}
          <div className="flex justify-center mb-6">
            <Avatar 
              className={`h-20 w-20 ${
                avatarShape === 'circle' 
                  ? 'rounded-full' 
                  : avatarShape === 'square' 
                    ? 'rounded-none' 
                    : 'rounded-md'
              }`}
              style={{ backgroundColor: avatarColor }}
            >
              <AvatarFallback 
                className={`text-xl font-bold ${
                  avatarShape === 'circle' 
                    ? 'rounded-full' 
                    : avatarShape === 'square' 
                      ? 'rounded-none' 
                      : 'rounded-md'
                }`}
                style={{ backgroundColor: avatarColor }}
              >
                {avatarInitials}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Color Selection */}
          <div className="mb-6">
            <Label className="block mb-2">Avatar Color</Label>
            <div className="grid grid-cols-4 gap-2">
              {colorOptions.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  className={`w-full h-10 rounded-md ${
                    avatarColor === color.value ? 'ring-2 ring-primary ring-offset-2' : ''
                  }`}
                  style={{ backgroundColor: color.value }}
                  onClick={() => setAvatarColor(color.value)}
                  title={color.label}
                  aria-label={`Select ${color.label} color`}
                />
              ))}
            </div>
          </div>

          <Separator className="my-4" />

          {/* Shape Selection */}
          <div className="mb-6">
            <Label className="block mb-2">Avatar Shape</Label>
            <RadioGroup
              value={avatarShape}
              onValueChange={(value) => setAvatarShape(value as 'circle' | 'square' | 'rounded')}
              className="flex space-x-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="circle" id="circle" />
                <Label htmlFor="circle">Circle</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="square" id="square" />
                <Label htmlFor="square">Square</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="rounded" id="rounded" />
                <Label htmlFor="rounded">Rounded</Label>
              </div>
            </RadioGroup>
          </div>

          <Separator className="my-4" />

          {/* Initials Input */}
          <div className="mb-6">
            <Label htmlFor="initials" className="block mb-2">
              Initials (max 2 characters)
            </Label>
            <Input
              id="initials"
              value={avatarInitials}
              onChange={(e) => setAvatarInitials(e.target.value.slice(0, 2).toUpperCase())}
              maxLength={2}
              className="w-20"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}