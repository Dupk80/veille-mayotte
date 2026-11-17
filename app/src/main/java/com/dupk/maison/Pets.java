package com.dupk.maison;

import java.util.Random;

/** Données des compagnons : emoji, cri et petites phrases pour les notifications. */
final class Pets {
    private Pets() {}

    static final Random RNG = new Random();

    static String emoji(String pet) {
        switch (pet) {
            case "dog": return "🐶";
            case "bunny": return "🐰";
            case "fox": return "🦊";
            case "panda": return "🐼";
            case "hamster": return "🐹";
            default: return "🐱";
        }
    }

    static String cry(String pet) {
        switch (pet) {
            case "dog": return "Wouf";
            case "bunny": return "Pouic";
            case "fox": return "Yip yip";
            case "panda": return "Mrrr";
            case "hamster": return "Couic";
            default: return "Miaou";
        }
    }

    static int color(String pet) {
        switch (pet) {
            case "dog": return 0xFFC68B59;
            case "bunny": return 0xFFF7A8C4;
            case "fox": return 0xFFF07B3F;
            case "panda": return 0xFF4A4A57;
            case "hamster": return 0xFFF2B880;
            default: return 0xFFF4A259;
        }
    }

    static String flavor(String pet) {
        String[] lines;
        switch (pet) {
            case "dog":
                lines = new String[]{"Je remue la queue rien que d'y penser !", "J'ai déjà rapporté tes chaussons 🥿", "Je t'attends derrière la porte !"};
                break;
            case "bunny":
                lines = new String[]{"Je grignote une carotte en t'attendant 🥕", "Mes oreilles frétillent d'impatience !", "Je fais des petits bonds de joie !"};
                break;
            case "fox":
                lines = new String[]{"Rusé comme un renard, tu vas finir à l'heure 🦊", "Ma queue touffue est prête pour les câlins !", "Je guette ton retour depuis la fenêtre."};
                break;
            case "panda":
                lines = new String[]{"Je mâchouille du bambou en attendant 🎋", "Je fais une roulade pour t'encourager !", "Câlin de panda en approche…"};
                break;
            case "hamster":
                lines = new String[]{"Je cours dans ma roue pour faire passer le temps !", "J'ai rempli mes joues de graines pour toi 🌻", "Je fais tourner la roue plus vite !"};
                break;
            default:
                lines = new String[]{"Je ronronne pour toi 😺", "Je garde ton canapé bien au chaud.", "Je vais faire la sieste sur ton clavier…"};
        }
        return lines[RNG.nextInt(lines.length)];
    }

    static String cheer() {
        String[] l = {"Courage, tu gères ! 💪", "On tient le bon bout !", "Pense à boire un peu d'eau 💧",
                "Respire un grand coup, ça avance !", "Chaque minute compte… à rebours ⏳", "Tu fais du super boulot ✨"};
        return l[RNG.nextInt(l.length)];
    }
}
